from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
import io
import cv2
import numpy as np

app = FastAPI(title="OMR Backend API", description="SaaS tabanlı Optik Okuyucu Backend'i")

# 1. Şema Endpoint'i
@app.get("/schema")
async def get_schema(question_count: int = 20):
    """
    Mobil uygulamanın ekranında formu nasıl çizeceğini söyler.
    Koordinatlar (x, y, w, h) yüzdelik dilimler (0.0 - 1.0) arasındadır.
    Mobil cihazın genişlik ve yüksekliği ile çarpılarak çizim yapılabilir.
    """
    questions = []
    options_labels = ["A", "B", "C", "D", "E"]
    
    start_y = 0.28
    y_step = 0.03
    base_x = 0.15
    opt_x_step = 0.05
    
    current_y = start_y
    for i in range(1, question_count + 1):
        if current_y > 0.88:
            # Kağıdın altına çok yaklaştıysa ikinci / sonraki sütuna geç
            current_y = start_y
            base_x += 0.40 # X eksenini sağa kaydır
            
        options = []
        for j, val in enumerate(options_labels):
            options.append({
                "val": val,
                "x": round(base_x + j * opt_x_step, 3),
                "y": round(current_y, 3)
            })
            
        questions.append({
            "q_no": i,
            "options": options
        })
        
        current_y += y_step

    return {
        "template_id": "zipgrade_20_v1",
        "base_aspect_ratio": 0.71, # Genişlik / Yükseklik (A4 oranı)
        "anchors": [
            {"id": "top_left", "x": 0.05, "y": 0.05},
            {"id": "middle_left", "x": 0.05, "y": 0.50},
            {"id": "bottom_left", "x": 0.05, "y": 0.95},
            {"id": "top_right", "x": 0.95, "y": 0.05},
            {"id": "middle_right", "x": 0.95, "y": 0.50},
            {"id": "bottom_right", "x": 0.95, "y": 0.95}
        ],
        "fields": [
            {"name": "student_name", "label": "Name", "x": 0.3, "y": 0.09, "w": 0.5, "h": 0.045},
            {"name": "student_number", "label": "Number", "x": 0.3, "y": 0.15, "w": 0.5, "h": 0.045}
        ],
        "questions": questions,
        "metadata": {
            "total_questions": question_count,
            "bubble_radius": 0.012 # Yuvarlakların tahmini yarıçap oranı
        }
    }

def order_points(pts):
    """
    4 noktayı her zaman: [Sol-Üst, Sağ-Üst, Sağ-Alt, Sol-Alt] sırasında dizer.
    """
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

@app.get("/generate_form")
async def generate_form(question_count: int = 30):
    """Dinamik olarak şemaya göre optik form çizer ve PNG olarak döndürür."""
    schema = await get_schema(question_count)
    
    # 1000x1400 (base_aspect_ratio: 0.71) boyutlarında beyaz tuval
    width, height = 1000, 1400
    img = np.ones((height, width, 3), dtype="uint8") * 255
    
    # 1. Anchors (Siyah Köşeler) - Her biri için 40x40 boyutunda kare çizelim
    anchor_size = 40
    for anchor in schema["anchors"]:
        cx = int(anchor["x"] * width)
        cy = int(anchor["y"] * height)
        cv2.rectangle(img, (cx - anchor_size, cy - anchor_size), (cx + anchor_size, cy + anchor_size), (0, 0, 0), -1)

    # 2. Fields (İsim, Numara vs. için içi boş dikdörtgenler)
    for field in schema["fields"]:
        fx = int(field["x"] * width)
        fy = int(field["y"] * height)
        fw = int(field["w"] * width)
        fh = int(field["h"] * height)
        cv2.rectangle(img, (fx, fy), (fx + fw, fy + fh), (0, 0, 0), 2)
        
        # Etiketleri kutunun soluna kısa bir şekilde yazıyoruz
        label = field.get("label", field["name"])
        text_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 1, 2)[0]
        text_x = fx - text_size[0] - 15  # Kutunun hemen soluna (15px boşluk)
        text_y = fy + (fh + text_size[1]) // 2
        cv2.putText(img, label, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)

    # 3. Bubbles (Soru - Şıklar)
    bubble_radius_ratio = schema["metadata"].get("bubble_radius", 0.012)
    bubble_radius_px = int(width * bubble_radius_ratio)

    if schema["questions"]:
        # Grup başlıkları (A B C D E vb.) her sütun için çizilsin
        column_xs = set()
        for q in schema["questions"]:
            first_opt_x = int(q["options"][0]["x"] * width)
            if first_opt_x not in column_xs:
                column_xs.add(first_opt_x)
                # Yeni bir sütun başlangıcı, A B C D E yazalım
                for opt in q["options"]:
                    cx = int(opt["x"] * width)
                    # 2.5 yerine 1.8 ile yuvarlaklara daha yakın olup üst kısımdan (OCR bölümünden) uzaklaşır
                    text_y = int(q["options"][0]["y"] * height) - int(bubble_radius_px * 1.8)
                    text_size = cv2.getTextSize(opt["val"], cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)[0]
                    text_x = cx - text_size[0] // 2
                    cv2.putText(img, opt["val"], (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)

    for q in schema["questions"]:
        q_no = q["q_no"]
        
        # Soru Numarasını en soldaki şıktan biraz daha sola çizelim
        first_opt_x = int(q["options"][0]["x"] * width)
        first_opt_y = int(q["options"][0]["y"] * height)
        
        q_text = f"{q_no}."
        q_text_size = cv2.getTextSize(q_text, cv2.FONT_HERSHEY_SIMPLEX, 1, 2)[0]
        # Yuvarlağın 15px soluna sağa dayalı şekilde yerleştir
        text_x = first_opt_x - bubble_radius_px - q_text_size[0] - 15
        text_y = first_opt_y + (q_text_size[1] // 2)
        cv2.putText(img, q_text, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)

        for opt in q["options"]:
            cx = int(opt["x"] * width)
            cy = int(opt["y"] * height)
            
            # Daireyi çiz
            cv2.circle(img, (cx, cy), bubble_radius_px, (0, 0, 0), 2)

    # Resmi stream et
    is_success, buffer = cv2.imencode(".png", img)
    io_buf = io.BytesIO(buffer)
    
    return StreamingResponse(io_buf, media_type="image/png")

# 2. İşleme Endpoint'i
@app.post("/process")
async def process_form(
    file: UploadFile = File(...),
    question_count: int = Form(20) # Mobilden gönderilecek soru sayısı form datası
):
    """
    Görüntü İşleme Büyüsü:
    1. Görüntüyü alır, gri tona çevirir, bulanıklaştırır.
    2. Köşeleri bulur, resmi "gerdirerek" (warp) standart bir forma oturtur.
    3. /schema içindeki oranlara göre piksellere gidip threshold uygulayarak okuma yapar.
    """
    try:
        # 1. Resmi oku ve NumPy dizisine çevir
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return JSONResponse(status_code=400, content={"error": "Geçersiz resim formatı."})

        # --- Görüntü İşleme Büyüsü ---
        
        # A. Preprocessing & Anchor Detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        # Adaptif eşikleme (aydınlatma dalgalanmalarına karşı dirençli OTSU)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        # Kağıt sınırının içindekileri de bulmak için RETR_EXTERNAL yerine RETR_LIST
        contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        
        possible_anchors = []
        for c in contours:
            area = cv2.contourArea(c)
            # Siyah kareler belli bir büyüklükte olmalı
            if 100 < area < 50000:
                x, y, w, h = cv2.boundingRect(c)
                aspect_ratio = float(w) / h
                solidity = area / float(w * h)
                
                # Kareye benzeyen ve içi dolu nesneleri filtrele
                if 0.5 <= aspect_ratio <= 1.5 and solidity > 0.7:
                    possible_anchors.append(c)

        # Alanı en büyük olanları anchor adayı yapalım (6 tane var ama ortam tozları olursa diye en büyük 10'u alırız)
        possible_anchors = sorted(possible_anchors, key=cv2.contourArea, reverse=True)[:10]
        
        if len(possible_anchors) < 4:
            return JSONResponse(
                status_code=400, 
                content={"error": f"Yeterli referans noktası (Yalnızca {len(possible_anchors)} adet) bulunamadı. Form tamamen karanlık, gölgeli veya çok uzak olabilir. Ayrıca kağıt uçlarının görünür olduğundan emin olun."}
            )

        # Anchorların merkezlerini hesapla
        anchor_centers = []
        for c in possible_anchors:
            M_c = cv2.moments(c)
            if M_c["m00"] != 0:
                cx = int(M_c["m10"] / M_c["m00"])
                cy = int(M_c["m01"] / M_c["m00"])
            else:
                x, y, w, h = cv2.boundingRect(c)
                cx, cy = x + w//2, y + h//2
            anchor_centers.append([cx, cy])
            
        src_pts = order_points(np.array(anchor_centers, dtype="float32"))
        
        schema = await get_schema(question_count)
        maxWidth, maxHeight = 1000, 1400
        
        # Şemadaki anchor idleri sırasıyla: top_left, top_right, bottom_left, bottom_right 
        # olarak schema'dan gelir. order_points fonksiyonu da TL, TR, BR, BL tarzı çıktı verir.
        dst_pts = np.zeros((4, 2), dtype="float32")
        for anchor in schema["anchors"]:
            if anchor["id"] == "top_left":
                dst_pts[0] = [int(anchor["x"] * maxWidth), int(anchor["y"] * maxHeight)]
            elif anchor["id"] == "top_right":
                dst_pts[1] = [int(anchor["x"] * maxWidth), int(anchor["y"] * maxHeight)]
            elif anchor["id"] == "bottom_right":
                dst_pts[2] = [int(anchor["x"] * maxWidth), int(anchor["y"] * maxHeight)]
            elif anchor["id"] == "bottom_left":
                dst_pts[3] = [int(anchor["x"] * maxWidth), int(anchor["y"] * maxHeight)]
                
        # B. Warping (Perspektif Düzeltme)
        M_transform = cv2.getPerspectiveTransform(src_pts, dst_pts)
        warped = cv2.warpPerspective(img, M_transform, (maxWidth, maxHeight), borderValue=(255,255,255))
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        
        # OMR İçin Hassas Eşikleme (Soru/Şık kabarcıklarını ayıklamak için)
        omr_thresh = cv2.adaptiveThreshold(
            warped_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15
        )

        # GÖRSEL HATA AYIKLAMA İÇİN KOPYA OLUŞTUR
        debug_img = warped.copy()

        # C. OCR Analizi (Öğrenci Bilgilerini Okuma)
        student_info = {}
        for field in schema["fields"]:
            fx = int(field["x"] * maxWidth)
            fy = int(field["y"] * maxHeight)
            fw = int(field["w"] * maxWidth)
            fh = int(field["h"] * maxHeight)
            
            # Yazı olan bölgeyi kes 
            field_crop = warped_gray[fy:fy+fh, fx:fx+fw]
            # Kontrastı artırmak okumayı iyileştirebilir
            _, field_crop = cv2.threshold(field_crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            # NOT: Render'da 512 MB belleği aşmamak için Ağır Yapay Zeka (EasyOCR) kaldırıldı.
            text = "Belirtilmemiş (Kamera Okuması Kapalı)"
            student_info[field["name"]] = text.strip()

            # DEBUG ÇİZİMİ: Text alanlarını mavi kutuya al ve okunan metni yaz
            cv2.rectangle(debug_img, (fx, fy), (fx+fw, fy+fh), (255, 0, 0), 2)
            cv2.putText(debug_img, text.strip(), (fx, fy - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 0, 0), 2)

        # D. OMR (Optik Okuma) Analizi
        questions = schema["questions"]
        bubble_radius_ratio = schema["metadata"].get("bubble_radius", 0.012)
        bubble_radius_px = int(maxWidth * bubble_radius_ratio)
        
        answers = {}

        for q in questions:
            q_no = q["q_no"]
            options = q["options"]
            
            marked_option = None
            max_filled_ratio = 0
            
            for opt in options:
                val = opt["val"]
                
                # Koordinatları piksele çevir
                bx = int(opt["x"] * maxWidth)
                by = int(opt["y"] * maxHeight)
                
                # Yalnızca çemberin iç kısmını analiz etmek için yarıçapı küçült (sınır çizgilerini yoksay)
                inner_radius = int(bubble_radius_px * 0.8)
                if inner_radius < 1:
                    inner_radius = 1

                mask = np.zeros(omr_thresh.shape, dtype="uint8")
                cv2.circle(mask, (bx, by), inner_radius, 255, -1)
                
                bubble_area = cv2.bitwise_and(omr_thresh, omr_thresh, mask=mask)
                total_pixels = cv2.countNonZero(mask)
                filled_pixels = cv2.countNonZero(bubble_area)
                
                if total_pixels > 0:
                    filled_ratio = filled_pixels / total_pixels
                    
                    if filled_ratio > max_filled_ratio:
                        max_filled_ratio = filled_ratio
                        # İçinin siyahlık oranı %48 barajı (Tolerans - Çember kalınlığını da içerdiği için 48 seçildi)
                        if filled_ratio >= 0.48:
                            marked_option = val

                    # DEBUG ÇİZİMİ: Şıkların üstüne yuvarlak at ve siyahlık oranını yaz. %48'i geçeni yeşil göster.
                    color = (0, 255, 0) if filled_ratio >= 0.48 else (0, 0, 255)
                    cv2.circle(debug_img, (bx, by), bubble_radius_px, color, 2)
                    cv2.putText(debug_img, f"{filled_ratio:.2f}", (bx - 15, by - bubble_radius_px - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

            # Eğer tüm şıklar boş veya şüpheliyse boş dönsün
            if marked_option is None:
                marked_option = ""

            answers[str(q_no)] = marked_option
        
        # Analizin görsel halini backend sunucusunda `debug_omr_output.jpg` adıyla kaydet
        # cv2.imwrite("debug_omr_output.jpg", debug_img)

        return {
            "status": "success",
            "student_info": student_info,
            "answers": answers,
            "metadata": {
                "processed_width": maxWidth,
                "processed_height": maxHeight
            }
        }

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# Uygulamayı çalıştırmak için:
# uvicorn src.main:app --reload

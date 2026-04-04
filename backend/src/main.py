from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
import io
import cv2
import numpy as np
import easyocr

reader = easyocr.Reader(['en', 'tr'], gpu=False)

app = FastAPI(title="OMR Backend API", description="SaaS tabanlı Optik Okuyucu Backend'i")

# 1. Şema Endpoint'i
@app.get("/schema")
async def get_schema():
    """
    Mobil uygulamanın ekranında formu nasıl çizeceğini söyler.
    Koordinatlar (x, y, w, h) yüzdelik dilimler (0.0 - 1.0) arasındadır.
    Mobil cihazın genişlik ve yüksekliği ile çarpılarak çizim yapılabilir.
    """
    return {
        "template_id": "zipgrade_20_v1",
        "base_aspect_ratio": 0.71, # Genişlik / Yükseklik (A4 oranı)
        "anchors": [
            {"id": "top_left", "x": 0.05, "y": 0.05},
            {"id": "top_right", "x": 0.95, "y": 0.05},
            {"id": "bottom_left", "x": 0.05, "y": 0.95},
            {"id": "bottom_right", "x": 0.95, "y": 0.95}
        ],
        "fields": [
            {"name": "student_name", "x": 0.2, "y": 0.1, "w": 0.6, "h": 0.05},
            {"name": "student_number", "x": 0.2, "y": 0.16, "w": 0.6, "h": 0.05}
        ],
        "questions": [
            {
                "q_no": 1,
                "options": [
                    {"val": "A", "x": 0.15, "y": 0.25},
                    {"val": "B", "x": 0.20, "y": 0.25},
                    {"val": "C", "x": 0.25, "y": 0.25},
                    {"val": "D", "x": 0.30, "y": 0.25},
                    {"val": "E", "x": 0.35, "y": 0.25}
                ]
            },
            {
                "q_no": 2,
                "options": [
                    {"val": "A", "x": 0.15, "y": 0.28},
                    {"val": "B", "x": 0.20, "y": 0.28},
                    {"val": "C", "x": 0.25, "y": 0.28},
                    {"val": "D", "x": 0.30, "y": 0.28},
                    {"val": "E", "x": 0.35, "y": 0.28}
                ]
            }
            # ... İhtiyaca göre 20 soru bu şekilde eklenebilir
        ],
        "metadata": {
            "total_questions": 20,
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
async def generate_form():
    """Dinamik olarak şemaya göre optik form çizer ve PNG olarak döndürür."""
    schema = await get_schema()
    
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
        cv2.putText(img, field["name"], (fx + 10, fy + 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)

    # 3. Bubbles (Soru - Şıklar)
    bubble_radius_ratio = schema["metadata"].get("bubble_radius", 0.012)
    bubble_radius_px = int(width * bubble_radius_ratio)

    if schema["questions"]:
        first_q = schema["questions"][0]
        for opt in first_q["options"]:
            cx = int(opt["x"] * width)
            text_y = int(first_q["options"][0]["y"] * height) - int(bubble_radius_px * 2.5)
            text_size = cv2.getTextSize(opt["val"], cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)[0]
            text_x = cx - text_size[0] // 2
            cv2.putText(img, opt["val"], (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)

    for q in schema["questions"]:
        q_no = q["q_no"]
        
        # Soru Numarasını en soldaki şıktan biraz daha sola çizelim
        first_opt_x = int(q["options"][0]["x"] * width)
        first_opt_y = int(q["options"][0]["y"] * height)
        cv2.putText(img, f"{q_no}.", (first_opt_x - 50, first_opt_y + 10), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)

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
async def process_form(file: UploadFile = File(...)):
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
        _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
        
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        possible_anchors = []
        for c in contours:
            area = cv2.contourArea(c)
            # Siyah kareler belli bir büyüklükte olmalı (Çok ufak tozlar elenir)
            if 100 < area < 100000:
                x, y, w, h = cv2.boundingRect(c)
                aspect_ratio = float(w) / h
                solidity = area / float(w * h)
                
                # Kareye benzeyen ve içi dolu nesneleri filtrele
                if 0.6 <= aspect_ratio <= 1.4 and solidity > 0.8:
                    possible_anchors.append(c)

        # Alanı en büyük olan 4 taneyi anchor kabul ediyoruz
        possible_anchors = sorted(possible_anchors, key=cv2.contourArea, reverse=True)[:4]
        
        if len(possible_anchors) < 4:
            return JSONResponse(
                status_code=400, 
                content={"error": "4 adet referans noktası (anchor) bulunamadı. Lütfen formu daha net çekin."}
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
        
        schema = await get_schema()
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
            warped_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 15
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
            
            # EasyOCR ile texti çıkart (detail=0 liste formatında çıkartır)
            text_result = reader.readtext(field_crop, detail=0)
            text = " ".join(text_result)
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
                
                mask = np.zeros(omr_thresh.shape, dtype="uint8")
                cv2.circle(mask, (bx, by), bubble_radius_px, 255, -1)
                
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
        cv2.imwrite("debug_omr_output.jpg", debug_img)

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

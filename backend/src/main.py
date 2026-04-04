from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
import io
import re
import cv2
import numpy as np
from PIL import Image
import pytesseract


def _ocr_lang() -> str:
    """Tesseract'ta tur paketi varsa tur+eng, yoksa eng döndür."""
    try:
        return "tur+eng" if "tur" in pytesseract.get_languages(config="") else "eng"
    except Exception:
        return "eng"


def _ocr_field(crop_gray: np.ndarray, lang: str) -> str:
    """
    Tek alan için sağlam OCR.
    • Görüntü temiz beyaz kenarlıkla çerçevelenir.
    • 3× büyütülür.
    • Karanlık zemin varsa otomatik tersine çevrilir (OTSU bazen inverse üretir).
    • Ham gri + OTSU binarize × psm 7/13 = 4 kombinasyon denenir.
    • En çok alfanümerik karakter içeren sonuç döndürülür.
    • Gürültü karakterler (parantez, boru, ok vs.) temizlenir.
    """
    # Beyaz kenarlık ekle — Tesseract kenar piksellerinden etkilenmesin
    bordered = cv2.copyMakeBorder(crop_gray, 20, 20, 20, 20,
                                  cv2.BORDER_CONSTANT, value=255)
    # 3× upscale
    up = cv2.resize(bordered, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)

    # Görüntü çoğunlukla karanlıksa (ters warp artefaktı) tersine çevir
    if np.mean(up) < 127:
        up = cv2.bitwise_not(up)

    _, bin_otsu = cv2.threshold(up, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    best, best_score = "", 0
    for img in (up, bin_otsu):
        pil = Image.fromarray(img)
        for psm in (7, 13):
            try:
                raw = pytesseract.image_to_string(
                    pil, lang=lang, config=f"--psm {psm} --oem 3"
                )
            except Exception:
                continue

            # Sadece alfanümerik + boşluk + Türkçe karakterler tut
            cleaned = re.sub(
                r"[^a-zA-Z0-9\s"
                r"ğüşıöçĞÜŞİÖÇ"
                r"\.\,\-\_\/]",
                "", raw
            ).strip()
            # Birden fazla boşluğu tek boşluğa indir
            cleaned = re.sub(r"\s+", " ", cleaned).strip()

            score = sum(1 for c in cleaned if c.isalnum())
            if score > best_score:
                best_score, best = score, cleaned

    return best if best_score >= 1 else "Okunamadı"

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
    
    # 1. Anchors - 20x20 px kare (40x40 toplam)
    anchor_size = 20
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
        schema = await get_schema(question_count)
        maxWidth, maxHeight = 1000, 1400

        # A. Preprocessing & Anchor Detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        img_h, img_w = img.shape[:2]
        img_area = img_h * img_w

        # Çoklu threshold yöntemiyle kare marker'ları bul
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh_otsu = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Morfolojik kapama: kopuk kenarları birleştir
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        thresh = cv2.morphologyEx(thresh_otsu, cv2.MORPH_CLOSE, kernel, iterations=2)

        contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        # Kare/dikdörtgen ve içi dolu şekilleri filtrele — boyut görüntüye göre orantılı
        raw_candidates = []
        for c in contours:
            area = cv2.contourArea(c)
            if img_area * 0.00015 < area < img_area * 0.025:
                bx, by, bw, bh = cv2.boundingRect(c)
                aspect = float(bw) / bh
                solidity = area / float(bw * bh)
                if 0.45 <= aspect <= 2.2 and solidity > 0.60:
                    raw_candidates.append((c, area))

        # En büyük 20'yi al, sonra boyut tutarsızlarını ele
        raw_candidates.sort(key=lambda x: x[1], reverse=True)
        raw_candidates = raw_candidates[:20]

        # Boyut tutarlılığı filtresi: medyan alanın 0.15x – 6x arasındakiler
        if raw_candidates:
            areas = [a for _, a in raw_candidates]
            median_a = float(np.median(areas[:min(8, len(areas))]))
            raw_candidates = [(c, a) for c, a in raw_candidates
                              if median_a * 0.15 < a < median_a * 6.0]

        anchor_candidates = [c for c, _ in raw_candidates]

        if len(anchor_candidates) < 4:
            return JSONResponse(
                status_code=400,
                content={"error": f"Yeterli referans noktası ({len(anchor_candidates)} adet) bulunamadı. Formu iyi aydınlatılmış, düz bir zeminde çekin ve tüm köşe karelerinin görünür olduğundan emin olun."}
            )

        # Merkezleri hesapla
        centers = []
        for c in anchor_candidates:
            M_c = cv2.moments(c)
            if M_c["m00"] != 0:
                cx_c = int(M_c["m10"] / M_c["m00"])
                cy_c = int(M_c["m01"] / M_c["m00"])
            else:
                bx, by, bw, bh = cv2.boundingRect(c)
                cx_c, cy_c = bx + bw // 2, by + bh // 2
            centers.append([cx_c, cy_c])

        # Sol/Sağ ayrımı: görüntü ortası yerine tüm adayların medyan-x'ini kullan
        # (form köşeden çekilse bile sol/sağ karıştırılmaz)
        med_x = float(np.median([p[0] for p in centers]))
        left_pts  = sorted([p for p in centers if p[0] <  med_x], key=lambda p: p[1])
        right_pts = sorted([p for p in centers if p[0] >= med_x], key=lambda p: p[1])

        if len(left_pts) < 2 or len(right_pts) < 2:
            return JSONResponse(
                status_code=400,
                content={"error": "Formun sol veya sağ tarafında yeterli marker bulunamadı. Tüm köşe karelerinin görünür olduğundan emin olun."}
            )

        def pick_column(pts, n=3):
            """Sıralı noktalardan: en üst, en alt ve mid-y'ye en yakın olanı seç."""
            if len(pts) <= n:
                return pts[:n]
            top    = pts[0]
            bottom = pts[-1]
            if n == 2:
                return [top, bottom]
            mid_y  = (top[1] + bottom[1]) / 2.0
            middle = min(pts[1:-1], key=lambda p: abs(p[1] - mid_y))
            return sorted([top, middle, bottom], key=lambda p: p[1])

        schema_anchor_map = {a["id"]: a for a in schema["anchors"]}
        use_6 = len(left_pts) >= 3 and len(right_pts) >= 3

        if use_6:
            tl, ml_pt, bl = pick_column(left_pts,  3)
            tr, mr_pt, br = pick_column(right_pts, 3)

            src_pts = np.array([tl, tr, mr_pt, br, bl, ml_pt], dtype="float32")
            dst_pts = np.array([
                [schema_anchor_map["top_left"]["x"]     * maxWidth, schema_anchor_map["top_left"]["y"]     * maxHeight],
                [schema_anchor_map["top_right"]["x"]    * maxWidth, schema_anchor_map["top_right"]["y"]    * maxHeight],
                [schema_anchor_map["middle_right"]["x"] * maxWidth, schema_anchor_map["middle_right"]["y"] * maxHeight],
                [schema_anchor_map["bottom_right"]["x"] * maxWidth, schema_anchor_map["bottom_right"]["y"] * maxHeight],
                [schema_anchor_map["bottom_left"]["x"]  * maxWidth, schema_anchor_map["bottom_left"]["y"]  * maxHeight],
                [schema_anchor_map["middle_left"]["x"]  * maxWidth, schema_anchor_map["middle_left"]["y"]  * maxHeight],
            ], dtype="float32")

            H, hmask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
            if H is None:
                return JSONResponse(status_code=400, content={"error": "Perspektif düzeltme matrisi hesaplanamadı."})
        else:
            tl, bl = left_pts[0],  left_pts[-1]
            tr, br = right_pts[0], right_pts[-1]

            src_pts = np.array([tl, tr, br, bl], dtype="float32")
            dst_pts = np.array([
                [schema_anchor_map["top_left"]["x"]     * maxWidth, schema_anchor_map["top_left"]["y"]     * maxHeight],
                [schema_anchor_map["top_right"]["x"]    * maxWidth, schema_anchor_map["top_right"]["y"]    * maxHeight],
                [schema_anchor_map["bottom_right"]["x"] * maxWidth, schema_anchor_map["bottom_right"]["y"] * maxHeight],
                [schema_anchor_map["bottom_left"]["x"]  * maxWidth, schema_anchor_map["bottom_left"]["y"]  * maxHeight],
            ], dtype="float32")

            H = cv2.getPerspectiveTransform(src_pts, dst_pts)

        # B. Warping — detected anchor'ları da debug için orijinal görüntü üzerine çiz
        debug_raw = img.copy()
        for p in centers:
            cv2.circle(debug_raw, (p[0], p[1]), 10, (0, 0, 255), -1)
        # cv2.imwrite("debug_anchors_raw.jpg", debug_raw)

        warped = cv2.warpPerspective(img, H, (maxWidth, maxHeight), borderValue=(255, 255, 255))
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        
        # OMR İçin Hassas Eşikleme (Soru/Şık kabarcıklarını ayıklamak için)
        omr_thresh = cv2.adaptiveThreshold(
            warped_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15
        )

        # GÖRSEL HATA AYIKLAMA İÇİN KOPYA OLUŞTUR
        debug_img = warped.copy()

        # Beklenen anchor konumlarını yeşil çemberle işaretle (warp doğruysa tam üstüne gelmeli)
        for anchor in schema["anchors"]:
            ax = int(anchor["x"] * maxWidth)
            ay = int(anchor["y"] * maxHeight)
            cv2.circle(debug_img, (ax, ay), 18, (0, 200, 0), 3)
            cv2.putText(debug_img, anchor["id"][:2], (ax + 20, ay + 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 180, 0), 1)

        # C. OCR Analizi (Öğrenci Bilgilerini Okuma)
        ocr_lang = _ocr_lang()
        student_info = {}
        for field in schema["fields"]:
            fx = int(field["x"] * maxWidth)
            fy = int(field["y"] * maxHeight)
            fw = int(field["w"] * maxWidth)
            fh = int(field["h"] * maxHeight)

            # Formun kendi siyah kenarlığını (2px) atlayarak iç alanı kes
            inset = 3
            field_crop = warped_gray[fy + inset:fy + fh - inset,
                                     fx + inset:fx + fw - inset]
            text = _ocr_field(field_crop, ocr_lang)
            student_info[field["name"]] = text

            cv2.rectangle(debug_img, (fx, fy), (fx + fw, fy + fh), (255, 0, 0), 2)
            cv2.putText(debug_img, text[:40], (fx, fy - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

        # D. OMR (Optik Okuma) Analizi
        questions = schema["questions"]
        bubble_radius_ratio = schema["metadata"].get("bubble_radius", 0.012)
        bubble_radius_px = int(maxWidth * bubble_radius_ratio)
        
        answers = {}

        for q in questions:
            q_no = q["q_no"]
            options = q["options"]

            marked_options = []  # Birden fazla işaretli şık desteklenir

            for opt in options:
                val = opt["val"]

                bx = int(opt["x"] * maxWidth)
                by = int(opt["y"] * maxHeight)

                inner_radius = max(int(bubble_radius_px * 0.8), 1)

                mask = np.zeros(omr_thresh.shape, dtype="uint8")
                cv2.circle(mask, (bx, by), inner_radius, 255, -1)

                bubble_area = cv2.bitwise_and(omr_thresh, omr_thresh, mask=mask)
                total_pixels = cv2.countNonZero(mask)
                filled_pixels = cv2.countNonZero(bubble_area)

                if total_pixels > 0:
                    filled_ratio = filled_pixels / total_pixels

                    if filled_ratio >= 0.48:
                        marked_options.append(val)

                    color = (0, 255, 0) if filled_ratio >= 0.48 else (0, 0, 255)
                    cv2.circle(debug_img, (bx, by), bubble_radius_px, color, 2)
                    cv2.putText(debug_img, f"{filled_ratio:.2f}", (bx - 15, by - bubble_radius_px - 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

            # Birden fazla işaret: "A,B" formatında; boşsa ""
            answers[str(q_no)] = ",".join(marked_options)
        
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

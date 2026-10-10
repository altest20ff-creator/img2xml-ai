import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io
from google import genai

app = FastAPI(
    title="Android UI Generator API",
    description="API لتصميم واجهات أندرويد XML من الصور"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY")

@app.get("/")
def read_root():
    return {"status": "Online", "message": "مرحباً بك في سيرفر تحويل الصور إلى واجهات أندرويد!"}

@app.post("/generate-ui")
async def generate_ui(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="الملف المرفوع يجب أن يكون صورة.")

    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))

        client = genai.Client(api_key=GEMINI_API_KEY)
        
        prompt = """
        أنت خبير متقدم في تطوير واجهات أندرويد (Android UI/UX Developer).
        قم بتحليل الصورة المرفقة واستخرج عناصر الواجهة بدقة.
        قم بتوليد كود Android XML كامل ونظيف باستخدام ConstraintLayout.
        أرجع كود الـ XML فقط بدون أي نصوص أو مقدمات إضافية.
        """

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt, image]
        )

        return {
            "success": True,
            "filename": file.filename,
            "xml_code": response.text
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"حدث خطأ أثناء المعالجة: {str(e)}")


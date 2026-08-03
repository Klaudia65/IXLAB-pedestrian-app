"""Face anonymisation for the swipe photos.

Wikimedia Commons street shots contain sharp, identifiable faces; Korea recognises
초상권 (portrait rights) and re-publishing recognisable faces in an app is a privacy
risk. (Mapillary photos are already face/plate-blurred by Mapillary's own pipeline,
so only the Commons ones need this.) We detect faces with OpenCV's YuNet model and
Gaussian-blur each region with a margin.

Model: OpenCV Zoo YuNet (face_detection_yunet_2023mar.onnx), fetched once into
analysis/models/. get_detector() lazy-downloads it if missing.

blur_faces_file(src, dst) -> number of faces blurred.
"""
import os
import pathlib
import shutil
import tempfile

import cv2
import numpy as np
import requests

HERE = pathlib.Path(__file__).resolve().parent
MODEL_PATH = HERE / "models" / "face_detection_yunet_2023mar.onnx"
MODEL_URL = ("https://github.com/opencv/opencv_zoo/raw/main/models/"
             "face_detection_yunet/face_detection_yunet_2023mar.onnx")

# Low threshold so distant/partial faces in a crowd are still caught (privacy > a
# few false positives, which only blur a harmless patch).
SCORE_THRESHOLD = 0.4
FACE_PAD = 0.45          # expand each detected box by this fraction before blurring

_detector = None


def _ensure_model():
    if not MODEL_PATH.exists():
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(MODEL_URL, timeout=120)
        r.raise_for_status()
        MODEL_PATH.write_bytes(r.content)


def get_detector():
    global _detector
    if _detector is None:
        _ensure_model()
        # OpenCV's ONNX file reader (like imread) uses the ANSI codepage and fails on
        # the repo's non-ASCII path, so load the model from an ASCII temp copy.
        tmp = os.path.join(tempfile.gettempdir(), "yunet_2023mar.onnx")
        if not os.path.exists(tmp) or os.path.getsize(tmp) != MODEL_PATH.stat().st_size:
            shutil.copyfile(MODEL_PATH, tmp)
        _detector = cv2.FaceDetectorYN.create(
            tmp, "", (320, 320),
            score_threshold=SCORE_THRESHOLD, nms_threshold=0.3, top_k=5000)
    return _detector


def _odd(n):
    n = int(n)
    return n + 1 if n % 2 == 0 else n


def blur_faces_file(src, dst, pad: float = FACE_PAD) -> int:
    """Blur every detected face in `src`, write to `dst`. Returns the face count.

    Reads/writes via numpy buffers (not cv2.imread/imwrite) because OpenCV's file I/O
    on Windows uses the ANSI codepage and fails on the non-ASCII path this repo lives
    under (…\\문서\\…)."""
    data = np.frombuffer(pathlib.Path(src).read_bytes(), np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        return 0
    h, w = img.shape[:2]
    det = get_detector()
    det.setInputSize((w, h))
    _, faces = det.detect(img)
    count = 0
    for f in (faces if faces is not None else []):
        x, y, fw, fh = (int(v) for v in f[:4])
        px, py = int(fw * pad), int(fh * pad)
        x0, y0 = max(0, x - px), max(0, y - py)
        x1, y1 = min(w, x + fw + px), min(h, y + fh + py)
        roi = img[y0:y1, x0:x1]
        if roi.size == 0:
            continue
        # kernel ~ the face size so the blur fully dissolves features (min 21).
        k = _odd(max(21, max(x1 - x0, y1 - y0)))
        img[y0:y1, x0:x1] = cv2.GaussianBlur(roi, (k, k), 0)
        count += 1
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if ok:
        pathlib.Path(dst).write_bytes(buf.tobytes())
    return count

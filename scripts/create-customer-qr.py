"""Generate a local print-ready QR using the bundled ReportLab encoder."""
from pathlib import Path
from PIL import Image, ImageDraw
from reportlab.graphics.barcode.qr import QrCodeWidget

url = "https://tge-live.netlify.app/"
target = Path(__file__).resolve().parents[1] / "event-kit"
target.mkdir(exist_ok=True)
qr = QrCodeWidget(url, barLevel="M").qr
qr.make()
assert b"".join(item.data for item in qr.dataList) == url.encode()
border, scale = 4, 20
size = qr.getModuleCount() + border * 2
image = Image.new("RGB", (size * scale, size * scale), "white")
draw = ImageDraw.Draw(image)
rects = []
for row, modules in enumerate(qr.modules):
    for col, dark in enumerate(modules):
        if dark:
            x, y = col + border, row + border
            draw.rectangle((x * scale, y * scale, (x + 1) * scale - 1, (y + 1) * scale - 1), fill="black")
            rects.append(f'<rect x="{x}" y="{y}" width="1" height="1"/>')
image.save(target / "customer-qr.png")
(target / "customer-qr.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" shape-rendering="crispEdges"><title>Customer order website</title><rect width="{size}" height="{size}" fill="white"/><g fill="black">' + ''.join(rects) + '</g></svg>', encoding="utf-8")
print(f"QR generated: {url}; {size * scale}px; four-module quiet border.")

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

out = Path(__file__).resolve().parent / 'cierre_contacto_reel.png'
w, h = 1920, 1080
im = Image.new('RGB', (w, h), (34, 11, 72))
d = ImageDraw.Draw(im)
for y in range(h):
    t = y / (h - 1)
    c = (int(54 + 35*t), int(18 + 12*t), int(112 + 38*t))
    d.line((0, y, w, y), fill=c)
font_dir = Path(r'C:\Windows\Fonts')
bold = ImageFont.truetype(str(font_dir / 'arialbd.ttf'), 76)
med = ImageFont.truetype(str(font_dir / 'arial.ttf'), 42)
small = ImageFont.truetype(str(font_dir / 'arialbd.ttf'), 28)
yellow, white, lavender = (250,204,21), (255,255,255), (225,214,255)
d.rounded_rectangle((250,130,1670,955), radius=48, fill=(255,255,255))
d.rounded_rectangle((250,130,1670,435), radius=48, fill=(67,25,125))
d.rectangle((250,370,1670,435), fill=(67,25,125))
d.text((350,190),'SMILO FUN',font=small,fill=yellow)
d.text((350,245),'Tu clínica, en buenas manos.',font=bold,fill=white)
d.text((350,350),'Gestión odontológica con inteligencia artificial',font=med,fill=lavender)
d.text((350,505),'¿Quieres conocer Dentamia?',font=med,fill=(61,37,91))
d.text((350,610),'LLÁMANOS',font=small,fill=(110,70,160))
d.rounded_rectangle((330,680,950,825),radius=26,fill=(250,204,21))
d.rounded_rectangle((970,680,1590,825),radius=26,fill=(250,204,21))
d.text((390,717),'938 977 259',font=bold,fill=(49,16,95))
d.text((1030,717),'962 339 442',font=bold,fill=(49,16,95))
d.text((350,870),'Escríbenos y da el siguiente paso para tu centro odontológico.',font=med,fill=(79,68,96))
im.save(out, quality=95)
print(out)

"""Build the illustrated atlas (not a measured DEM).
Requires Pillow, numpy, scipy. Input: world-atlas 2 countries-50m.json.
Coastline: Natural Earth, public domain, via world-atlas (ISC).
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, zoom, distance_transform_edt

root = Path(__file__).resolve().parents[1]
topo = json.loads((root/'public/data/countries.json').read_text())
country = next(g for g in topo['objects']['countries']['geometries'] if g.get('id') == '450')
scale, trans = topo['transform']['scale'], topo['transform']['translate']
def arc(index):
    raw = topo['arcs'][index if index >= 0 else ~index]
    coords = np.cumsum(raw, axis=0) * scale + trans
    return coords[::-1] if index < 0 else coords
polys = country['arcs'] if country['type'] == 'MultiPolygon' else [country['arcs']]
rings = []
for poly in polys:
    rings.append(np.concatenate([arc(i) for i in poly[0]]).tolist())
(root/'public/data/madagascar.json').write_text(json.dumps(rings, separators=(',',':')))
W,H = 1600,2000
# Matching SVG viewBox 0 0 800 1000; lon 39..52.33, lat -10..-26.67.
def project(lon,lat): return ((lon-39)*120,(-lat-10)*120)
maskim = Image.new('L',(W,H)); draw=ImageDraw.Draw(maskim)
for ring in rings: draw.polygon([project(*p) for p in ring], fill=255)
mask=np.array(maskim)>0
Y,X=np.mgrid[0:H,0:W]
lon=X/120+39; lat=-Y/120-10
rng=np.random.default_rng(48)
def noise(size):
    a=rng.random((int(H/size)+2,int(W/size)+2))
    return zoom(a, (H/a.shape[0],W/a.shape[1]),order=3)[:H,:W]
n=noise(180)*.46+noise(75)*.25+noise(28)*.15+noise(12)*.09+noise(4)*.05
coast=distance_transform_edt(mask)
spine_lon=48.5+(lat+15)*.21
ridge=np.exp(-((lon-spine_lon)/.85)**2)
north=np.exp(-((lon-49.05)/.5)**2-((lat+14.05)/.9)**2)
south=np.exp(-((lon-46.9)/.55)**2-((lat+22.15)/.9)**2)
h=(ridge*(.45+n*.9)+north*.6+south*.55)*np.clip(coast/40,0,1)
h+=np.clip(coast/100,0,1)*(n*.28)
dy,dx=np.gradient(gaussian_filter(h,1))
shade=np.clip(.92-dx*25-dy*19,.46,1.35)
# ochre western lowlands, terracotta highlands, wet eastern escarpment.
west=np.array([182,164,108]); red=np.array([166,109,76]); green=np.array([76,109,74]); arid=np.array([197,161,112])
t=np.clip(ridge*.94,0,1)[...,None]
color=west*(1-t)+red*t
east=np.clip((lon-spine_lon+.15)*1.5,0,1)[...,None]
color=color*(1-east)+green*east
southmask=np.clip((-lat-22.5)/2,0,1)[...,None]*(1-east)
color=color*(1-southmask)+arid*southmask
wetnorth=(north*.7)[...,None]; color=color*(1-wetnorth)+green*wetnorth
# Small-scale exposed rock and vegetation; contours enhance the relief.
patch=np.clip((n-.53)*5,0,.45)[...,None]
color=color*(1-patch)+np.array([99,119,75])*patch
rock=np.clip((h-1.02)*1.9,0,.65)[...,None]
color=color*(1-rock)+np.array([169,157,133])*rock
color*=shade[...,None]
color+=(n[...,None]-.5)*33
beach=np.clip((10-coast)/10,0,1)[...,None]
color=color*(1-beach*.65)+np.array([224,209,170])*beach*.65
# transparent ocean: UI supplies its own paper/sea texture.
rgba=np.zeros((H,W,4),dtype=np.uint8); rgba[:,:,:3]=np.clip(color,0,255); rgba[:,:,3]=mask*255
Image.fromarray(rgba).save(root/'public/images/atlas-relief.png',optimize=True)
# Crop generated photographic contact sheet into six local assets.
im=Image.open(root/'public/images/biomes.jpg'); w,h=im.size
for i,name in enumerate(['rainforest','baobabs','spiny','volcanic','coast','rivers']):
    x,y=i%3,i//3
    im.crop((x*w//3,y*h//2,(x+1)*w//3,(y+1)*h//2)).save(root/f'public/images/{name}.jpg',quality=88)
print('Atlas and biome images generated.')

"""Stream a georeferenced procedural 16-bit Madagascar heightmap.

This is an art-direction heightmap, NOT surveyed elevation data (DEM).
Coastline: Natural Earth / world-atlas. Peaks are constrained to reference
altitudes; unsurveyed valleys and ridges are procedural.

  python scripts/export-heightmap.py --size 16384
  python scripts/export-heightmap.py --size 512 --output generated/test

Requires numpy and Pillow. Memory is bounded by strip height, not total area.
Outputs little-endian unsigned .r16, plus metadata for Unreal/Unity/Godot.
The default 16K raster is 512 MiB; generated/ is deliberately gitignored.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BBOX = [42.7, -26.2, 50.8, -11.6]  # west, south, east, north
MIN_HEIGHT, MAX_HEIGHT = -250.0, 3000.0
PEAKS = [(48.9667, -14.022, 2876.0, .30), (47.233, -19.35, 2642.0, .27), (46.884, -22.195, 2658.0, .27)]

def smooth(a, b, x):
    t = np.clip((x-a)/(b-a), 0, 1)
    return t*t*(3-2*t)

def noise(x, y):
    # Smooth, bounded, deterministic waves at multiple terrain scales.
    return (np.sin(x*17+y*9)*np.cos(y*13-x*7)*.48 +
            np.sin(x*47-y*31)*np.cos(y*37+x*29)*.25 +
            np.sin(x*113+y*71)*np.cos(y*89-x*67)*.15 +
            np.sin(x*223-y*179)*np.cos(y*191+x*157)*.08)

def elevation(lon, lat):
    spine = 48.1 + (lat+17)*.20
    distance = lon-spine
    # Slow westward descent; much narrower, steep eastern escarpment.
    profile = np.where(distance<0, np.exp(-(distance/1.5)**2), np.exp(-(distance/.48)**2))
    plateau = 1100*profile + 130
    hills = noise(lon, lat)*180*profile
    height = plateau+hills
    # Lavaka-like erosion gullies on the lateritic plateau, artist-directed.
    gullies = np.maximum(0, np.sin(lon*42+lat*17)-.78)*260*profile
    height -= gullies
    for x,y,altitude,spread in PEAKS:
        radius = np.sqrt(((lon-x)*.94)**2+(lat-y)**2)
        peak = altitude*np.exp(-(radius/spread)**1.4)
        height = np.maximum(height, peak)
    return np.clip(height, 0, 2876)

def main():
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--size',type=int,default=16384)
    parser.add_argument('--output',default='generated/madagascar-16k')
    args=parser.parse_args()
    if not 64 <= args.size <= 16384:
        parser.error('--size must be between 64 and 16384')
    target=ROOT/args.output
    target.parent.mkdir(parents=True,exist_ok=True)
    rings=json.loads((ROOT/'public/data/madagascar.json').read_text())
    west,south,east,north=BBOX
    def pixel(p): return ((p[0]-west)/(east-west)*(args.size-1),(north-p[1])/(north-south)*(args.size-1))
    polygons=[[pixel(p) for p in ring] for ring in rings]
    longitudes=np.linspace(west,east,args.size,dtype=np.float64)[None,:]
    with target.with_suffix('.r16').open('wb') as stream:
        for start in range(0,args.size,64):
            count=min(64,args.size-start)
            latitudes=(north-np.arange(start,start+count,dtype=np.float64)/(args.size-1)*(north-south))[:,None]
            mask=Image.new('L',(args.size,count));draw=ImageDraw.Draw(mask)
            for polygon in polygons: draw.polygon([(x,y-start) for x,y in polygon],fill=255)
            land=np.asarray(mask)>0
            first=land.argmax(axis=1)[:,None]
            last=(args.size-1-land[:,::-1].argmax(axis=1))[:,None]
            west_coast=west+first/(args.size-1)*(east-west)
            east_coast=west+last/(args.size-1)*(east-west)
            coastal_taper=smooth(0,.16,longitudes-west_coast)*smooth(0,.08,east_coast-longitudes)
            h=np.where(land,elevation(longitudes,latitudes)*coastal_taper,-50)
            raster=np.rint((h-MIN_HEIGHT)/(MAX_HEIGHT-MIN_HEIGHT)*65535).astype('<u2')
            stream.write(raster.tobytes())
    meta={'type':'procedural art-direction heightmap; NOT a surveyed DEM','width':args.size,'height':args.size,
          'format':'unsigned 16-bit little-endian, row-major, north at row 0','crs':'EPSG:4326',
          'bounds_west_south_east_north':BBOX,'decode_metres':'sample / 65535 * 3250 - 250',
          'sea_level_metres':0,'reference_peaks':[{'lon':x,'lat':y,'metres':h} for x,y,h,_ in PEAKS],
          'coastline':'Natural Earth, public domain, via world-atlas 2.0.2',
          'note':'Coastal cliffs are stylised. Import using non-square physical dimensions from bounds. Not loaded by the 760m browser prototype.'}
    target.with_suffix('.json').write_text(json.dumps(meta,indent=2)+'\n')
    print(f'Exported {args.size} × {args.size}: {target.with_suffix(".r16")} ({args.size**2*2/1024**2:.1f} MiB)')

if __name__=='__main__': main()

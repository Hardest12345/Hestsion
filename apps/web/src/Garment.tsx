import { useId } from 'react';
import { colorHex, type ClothingItem } from '../../../packages/domain';
import { ClothingPhoto } from './ClothingPhoto';

// Original vector thumbnails. No remote photos, fonts, or image services.
export function Garment({ item, ghost = false }: { item: ClothingItem; ghost?: boolean }) {
  const uid = useId().replace(/:/g, '');
  if (item.photoRef && !ghost) return <ClothingPhoto key={`${item.photoRef.assetId}-${item.photoRef.status}`} item={item}/>;
  const color = ghost ? '#d9d5ca' : item.primaryColor ? colorHex[item.primaryColor] : '#b7b3ac';
  const kind = item.illustration ?? ({ top: 'tee', bottom: 'trousers', shoes: 'sneakers', outer: 'jacket', one_piece: 'dress', headwear: 'scarf', accessory: 'scarf' } as const)[item.category];
  const stroke = ghost ? '#c5c0b6' : '#24231e';
  return <svg viewBox="0 0 160 170" role="img" aria-label={`Ilustrasi ${item.name}`} className={`garment ${ghost ? 'ghost' : ''}`}>
    <defs>
      <linearGradient id={`${uid}fabric`} x1="0" y1="0" x2="1" y2="0"><stop stopColor={color}/><stop offset=".45" stopColor={color}/><stop offset="1" stopColor={color} stopOpacity=".80"/></linearGradient>
      <filter id={`${uid}shadow`} x="-40%" y="-30%" width="180%" height="180%"><feDropShadow dx="1" dy="5" stdDeviation="3" floodColor="#353021" floodOpacity=".13"/></filter>
    </defs>
    <g fill={`url(#${uid}fabric)`} stroke={stroke} strokeOpacity={ghost ? .5 : .26} strokeWidth="1.3" strokeLinejoin="round" filter={`url(#${uid}shadow)`}>
      {['shirt', 'tee', 'knit', 'jacket'].includes(kind) && <>
        <path d={kind === 'tee' ? 'M56 27 36 35 15 68 36 82 48 63 45 142 Q80 149 115 142 L112 63 124 82 145 68 124 35 104 27 Q80 40 56 27Z' : 'M55 25 36 33 13 113 34 120 49 72 45 145 Q80 151 115 145 L111 72 126 120 147 113 124 33 105 25 Q80 36 55 25Z'}/>
        {kind === 'tee' || kind === 'knit' ? <path d="M58 28 Q80 55 102 28" fill="none" strokeWidth="3"/> : <>
          <path d="m55 25 25 13-16 20-14-25Zm50 0L80 38l16 20 14-25Z"/>
          <path d="M80 39v105" fill="none"/>
          {[65, 82, 99, 116, 133].map(y => <circle key={y} cx="83" cy={y} r="1.3" fill={stroke} stroke="none" opacity=".45"/>)}
          <path d="M94 65h14v18q-7 5-14 0Z" fill="none"/>
        </>}
        {kind === 'knit' && <g opacity=".16"><path d="M51 70h58M50 80h60M49 90h62M48 100h64M48 110h64M47 120h66M47 130h66" fill="none"/><path d="M48 140h65" strokeWidth="4"/></g>}
        {kind === 'jacket' && <><path d="m60 28 20 22-16 34-7-35 7-8ZM100 28 80 50l16 34 7-35-7-8Z"/><path d="M53 106h18v20H53ZM89 106h18v20H89Z" fill="none"/></>}
        <path d="M49 66 53 137M111 66l-4 71" opacity=".2" fill="none"/>
      </>}
      {['jeans', 'trousers'].includes(kind) && <>
        <path d="M45 17 Q80 22 115 17 L119 66 109 155 83 155 80 77 75 155 49 155 40 66Z"/>
        <path d="M44 29q35 6 72 0M80 29v48M48 33q0 20 17 21M110 33q0 20-17 21M53 68l7 82M106 68l-8 82" fill="none"/>
        <path d="M56 20v11M103 20v11" strokeWidth="3"/><circle cx="82" cy="28" r="2"/>
        {kind === 'jeans' && <path d="m48 145 28 1m8 0 26-1" strokeWidth="4" opacity=".5"/>}
      </>}
      {['sneakers', 'loafers'].includes(kind) && <g transform="translate(0 12)">
        <path d={kind === 'sneakers' ? 'M23 67 43 62 59 79 90 93Q112 93 115 108L111 122H20Q10 107 19 95Z' : 'M24 70q12-11 27-6L66 87l32 9q19 2 18 19l-5 9H21q-13-14-4-28Z'}/>
        <path d="M17 111q43 7 96 0l-2 11H20Z" fill={kind === 'sneakers' ? '#eee9de' : '#534637'}/>
        <path d="m39 77 18-3m-11 9 18-3m-9 9 17-3" fill="none" strokeWidth={kind === 'sneakers' ? 2 : 0}/>
        <g transform="translate(38 -37) scale(.84)"><path d="M23 67 43 62 59 79 90 93Q112 93 115 108L111 122H20Q10 107 19 95Z"/><path d="M17 111q43 7 96 0l-2 11H20Z" fill={kind === 'sneakers' ? '#eee9de' : '#534637'}/><path d="m39 77 18-3m-11 9 18-3m-9 9 17-3" fill="none"/></g>
      </g>}
      {kind === 'dress' && <path d="m60 20-15 15 12 40-26 75q49 17 98 0L103 75l12-40-15-15q-20 22-40 0Z"/>}
      {kind === 'scarf' && <path d="M43 25q40-15 74 5L98 75l16 76-27 4-9-76-22 74-25-11L61 68Z"/>}
    </g>
  </svg>;
}

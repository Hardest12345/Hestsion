import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { type ClothingItem } from '../../../packages/domain';
import { photoStatusLabel, type PhotoVariant } from '../../../packages/domain/media';
import { useCloud } from './cloud';

export function ClothingPhoto({ item, variant }: { item: ClothingItem; variant?: PhotoVariant }) {
  const { api, user } = useCloud();
  const ref = item.photoRef!;
  const selected = variant ?? (ref.status === 'ready' ? 'cutout' : 'original');
  const requestKey = `${user?.id ?? ''}:${item.ownerId}:${ref.assetId}:${selected}`;
  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null);
  const [failedKey, setFailedKey] = useState('');
  const url = photo?.key === requestKey ? photo.url : '';
  const failed = failedKey === requestKey;
  useEffect(() => {
    let active = true;
    if (!api || !user || user.id !== item.ownerId) return;
    void api.photo(ref.assetId, selected).then(value => { if (active) { setPhoto({ key: requestKey, url: value }); setFailedKey(''); } }).catch(() => { if (active) setFailedKey(requestKey); });
    return () => { active = false; };
  }, [api, user, item.ownerId, ref.assetId, selected, requestKey]);
  const unavailable = !user || user.id !== item.ownerId;
  return <span className="garment garment-photo">
    {url && !failed && !unavailable ? <img src={url} alt={`Foto ${item.name}${selected === 'original' ? ', asli' : ', tanpa latar'}`} onError={() => setFailedKey(requestKey)} referrerPolicy="no-referrer"/> : <span className="photo-placeholder"><ImageOff size={23}/><span>{failed || unavailable ? 'Foto tidak tersedia' : 'Memuat foto…'}</span></span>}
    {!variant && <span className={`photo-status photo-${ref.status}`}>{failed || unavailable ? 'Foto tidak tersedia' : photoStatusLabel[ref.status]}</span>}
  </span>;
}

import type { ClothingItem } from './index';
export const DEMO_OWNER = 'demo-local-user';
const item = (id: string, name: string, category: ClothingItem['category'], primaryColor: ClothingItem['primaryColor'], formality: number, illustration: ClothingItem['illustration'], status: ClothingItem['status'] = 'available', styleTags: string[] = []): ClothingItem => ({ id, ownerId: DEMO_OWNER, name, category, primaryColor, formality, illustration, status, styleTags, layerWarmth: category === 'outer' ? 2 : 0 });
export const demoItems: ClothingItem[] = [
  item('shirt-white', 'Kemeja putih', 'top', 'white', 3, 'shirt', 'available', ['smart_casual']),
  item('tee-ivory', 'T-shirt gading', 'top', 'ivory', 1, 'tee'),
  item('shirt-navy', 'Kemeja navy', 'top', 'navy', 3, 'shirt', 'available', ['smart_casual']),
  item('knit-olive', 'Knit olive', 'top', 'olive', 2, 'knit', 'available', ['earth_tone']),
  item('tee-white', 'T-shirt putih', 'top', 'white', 1, 'tee'),
  item('jeans-black', 'Jeans hitam', 'bottom', 'black', 2, 'jeans'),
  item('trousers-cream', 'Celana krem', 'bottom', 'cream', 3, 'trousers', 'available', ['earth_tone']),
  item('jeans-blue', 'Jeans biru', 'bottom', 'blue', 1, 'jeans'),
  item('sneakers-white', 'Sneakers putih', 'shoes', 'white', 1, 'sneakers'),
  item('loafers-brown', 'Loafers cokelat', 'shoes', 'brown', 3, 'loafers', 'available', ['earth_tone']),
  item('sneakers-black', 'Sneakers hitam', 'shoes', 'black', 1, 'sneakers'),
  item('jacket-brown', 'Jaket cokelat', 'outer', 'brown', 2, 'jacket', 'available', ['earth_tone']),
  item('blazer-grey', 'Blazer abu-abu', 'outer', 'grey', 4, 'jacket'),
  item('shirt-laundry', 'Kemeja putih laundry', 'top', 'white', 3, 'shirt', 'unavailable'),
  item('old-loafers', 'Loafers lama', 'shoes', 'black', 4, 'loafers', 'archived'),
  item('dress-burgundy', 'Terusan burgundy', 'one_piece', 'burgundy', 3, 'dress'),
];

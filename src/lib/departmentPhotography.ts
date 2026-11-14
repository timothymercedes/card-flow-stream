import collectibles from '@/assets/departments/collectibles.webp';
import automotive from '@/assets/departments/automotive.webp';
import electronics from '@/assets/departments/electronics.webp';
import fashion from '@/assets/departments/fashion.webp';
import home from '@/assets/departments/home.webp';
import gaming from '@/assets/departments/gaming.webp';
import tools from '@/assets/departments/tools.webp';
import sports from '@/assets/departments/sports_outdoors.webp';
import business from '@/assets/departments/business.webp';
import music from '@/assets/departments/music.webp';
import garden from '@/assets/departments/garden_outdoors.webp';

export const departmentPhotography: Record<string, string> = {
  collectibles, automotive, electronics, fashion, home, gaming, tools,
  sports_outdoors: sports, business, music, garden_outdoors: garden,
};
export function departmentDisplayLabel(department: {value: string; label: string}) {
  return department.value === 'home' ? 'Home & Living' : department.label;
}
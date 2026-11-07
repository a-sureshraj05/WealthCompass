import type { TabId } from '../components/navItems';
export type PreviewDesign = 'current' | 'refined';
export type OverviewSection = 'snapshot' | 'performance' | 'insights';

export const previewDesign = (search = ''): PreviewDesign => new URLSearchParams(search).get('design') === 'refined' ? 'refined' : 'current';
export const previewOverviewSection = (search = ''): OverviewSection => {
  const section = new URLSearchParams(search).get('section');
  return section === 'performance' || section === 'insights' ? section : 'snapshot';
};

export function previewDesignHref(design: PreviewDesign, portfolio: string, tab: TabId, section: OverviewSection = 'snapshot') {
  const query = new URLSearchParams();
  if (design === 'refined') query.set('design', design);
  if (portfolio !== 'standard') query.set('portfolio', portfolio);
  if (section !== 'snapshot') query.set('section', section);
  return `/design-preview${query.size ? `?${query}` : ''}#${tab}`;
}

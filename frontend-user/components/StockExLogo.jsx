/** StockEx brand logo served from /public/images */
export const STOCKEX_LOGO_SRC = '/images/stockexlogoenhanced.png';

export function StockExLogo({ className = 'h-8 w-auto object-contain', alt = 'StockEx' }) {
  return <img src={STOCKEX_LOGO_SRC} alt={alt} className={className} />;
}

import { cn } from "@/lib/utils";

/**
 * Molly's `_Molly` wordmark (brand kit v3, molly-wordmark.svg), inlined and sized by
 * height. Never retype it in CSS. Width follows the 392.82 x 125.54 viewBox.
 */
export function LogoMark({ className, height = 20 }: { className?: string; height?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 392.82 125.54"
      height={height}
      width={(height * 392.82) / 125.54}
      role="img"
      aria-label="Molly"
      className={cn("block shrink-0", className)}
    >
      <title>Molly</title>
      <path d="M0 107.41H66.48V125.54H0Z" fill="#5B8DC5" />
      <path d="M81.58 0H102.13L122.68 66.67L143.23 0H163.78V100H143.23V66.67L132.95 100H112.41L102.13 66.67V100H81.58ZM207.61 101.37Q197.61 101.37 190.21 97.6Q182.82 93.84 178.78 87.05Q174.73 80.27 174.73 71.23V53.42Q174.73 44.38 178.78 37.6Q182.82 30.82 190.21 27.05Q197.61 23.29 207.61 23.29Q217.75 23.29 225.08 27.05Q232.41 30.82 236.45 37.6Q240.49 44.38 240.49 53.42V71.23Q240.49 80.27 236.45 87.05Q232.41 93.84 225.08 97.6Q217.75 101.37 207.61 101.37ZM335.69 124.66 345.97 96.3 317.75 24.66H340.08L351.45 57.53Q352.68 61.23 353.98 66.51Q355.28 71.78 355.97 75.07Q356.65 71.78 357.95 66.51Q359.26 61.23 360.49 57.53L371.45 24.66H392.82L357.2 124.66ZM251.45 0H272V100H251.45ZM284.6 0H305.15V100H284.6ZM207.61 83.56Q213.64 83.56 216.79 80.34Q219.94 77.12 219.94 71.23V53.42Q219.94 47.4 216.79 44.25Q213.64 41.1 207.61 41.1Q201.72 41.1 198.5 44.25Q195.28 47.4 195.28 53.42V71.23Q195.28 77.12 198.5 80.34Q201.72 83.56 207.61 83.56Z" fill="#14140F" />
    </svg>
  );
}

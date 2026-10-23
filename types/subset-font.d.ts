declare module 'subset-font' {
  export default function subsetFont(
    font: Uint8Array,
    text: string,
    options?: { targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2'; preserveNameIds?: number[]; variationAxes?: Record<string, number | { min: number; max: number; default?: number }> },
  ): Promise<Uint8Array>;
}

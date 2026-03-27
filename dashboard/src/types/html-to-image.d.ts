declare module "html-to-image" {
  export interface Options {
    cacheBust?: boolean;
    pixelRatio?: number;
    backgroundColor?: string;
    quality?: number;
    width?: number;
    height?: number;
    style?: Record<string, string>;
    filter?: (domNode: HTMLElement) => boolean;
  }

  export function toPng(node: HTMLElement, options?: Options): Promise<string>;
}

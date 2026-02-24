declare module 'gray-matter' {
  interface GrayMatterFile {
    data: Record<string, unknown>;
    content: string;
    excerpt?: string;
    orig: string;
    language: string;
    matter: string;
    stringify: (lang?: string) => string;
    isEmpty: boolean;
  }

  interface GrayMatterOption {
    excerpt?: boolean | ((input: GrayMatterFile) => string);
    excerpt_separator?: string;
    engines?: Record<string, unknown>;
    language?: string;
    delimiters?: string | [string, string];
  }

  function matter(input: string, options?: GrayMatterOption): GrayMatterFile;
  function matter(input: Buffer, options?: GrayMatterOption): GrayMatterFile;

  export = matter;
}

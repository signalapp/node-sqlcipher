declare module 'require-addon' {
  export default function requireAddon(
    specifier: string,
    parentURL: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any;
}

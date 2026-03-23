declare module 'wait-on' {
  interface WaitOnOptions {
    resources: string[];
    delay?: number;
    interval?: number;
    timeout?: number;
    window?: number;
  }

  function waitOn(options: WaitOnOptions): Promise<void>;

  export default waitOn;
}

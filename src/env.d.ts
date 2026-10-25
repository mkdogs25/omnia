declare module 'mammoth/mammoth.browser.min.js' {
  interface Result { value: string; messages: { type: string; message: string }[] }
  const mammoth: { convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: object): Promise<Result> }
  export default mammoth
}

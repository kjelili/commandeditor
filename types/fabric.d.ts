// Ambient module declaration for fabric.js v5 (no official @types package
// for v5; v6 ships its own types). We deliberately type as `any` because
// the only consumer in this app uses fabric loosely via dynamic import.
declare module 'fabric' {
  const fabric: any
  export = fabric
}

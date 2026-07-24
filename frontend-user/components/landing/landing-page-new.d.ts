// Companion type declaration for the plain-JS landing component so the
// TypeScript build (noImplicitAny) can import it without a TS7016 error.
// Runtime still uses landing-page-new.jsx; this only supplies the type.
declare const LandingPageNew: (props?: any) => any;
export default LandingPageNew;

// Stand-in for @shopify/app-bridge-react when rendering pages outside Shopify.
export const useAppBridge = () => ({ toast: { show() {} }, modal: { show() {}, hide() {} }, saveBar: { show() {}, hide() {} } });
export const SaveBar = () => null;
export const Modal = () => null;
export const TitleBar = () => null;

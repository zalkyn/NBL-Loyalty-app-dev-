export const generateDiscountCode = () => {
    const code = Math.random().toString(36).substring(2, 9).toUpperCase();
    return "NBL_" + code;
}
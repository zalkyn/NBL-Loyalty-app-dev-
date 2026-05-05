import { logger } from "app/utils/logger"

export const loader = async ({ request }) => {
    try {
        const data = await request.data();
        logger.info("loox data", {
            ...data
        })
    } catch (error) {
        logger.error("Loox new review", {
            error: error?.message,
            stack: error?.stack,
            module: "api/loox-new-review-trigger"
        })
    }
}


export const action = async ({ request }) => {
    try {
        const data = await request.json();

        logger.info("loox new review", {
            author: data.author,
            email: data.email,
            rating: data.rating,
            product_title: data.product_title,
            order_id: data.order_id,
        });

        return new Response("OK", { status: 200 });
    } catch (error) {
        logger.error("loox new review", {
            error: error?.message,
            stack: error?.stack,
            module: "api/loox-new-review-trigger",
        });

        // return new Response("Bad Request", { status: 400 });
        return new Response("OK", { status: 200 });
    }
};
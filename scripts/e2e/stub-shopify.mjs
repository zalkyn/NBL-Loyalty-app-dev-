// Stand-in for app/shopify.server.js: the jobs call unauthenticated.admin(shop)
// and get the scenario's fake admin plus the shop's session row.
import prisma from "../../app/db.server.js";

export const unauthenticated = {
    admin: async (shop) => ({ admin: globalThis.__fakeAdmin, session: await prisma.session.findFirst({ where: { shop } }) }),
};
// Pages' real loaders call authenticate.admin(request): hand them the fake admin and the shop's session.
export const authenticate = {
    admin: async () => {
        const session = await prisma.session.findFirst();
        return { admin: globalThis.__fakeAdmin, session, cors: (r) => r, redirect: (u) => { throw new Response(null, { status: 302, headers: { Location: u } }); } };
    },
};
export default {};

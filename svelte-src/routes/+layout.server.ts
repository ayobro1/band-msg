export const load = async ({ locals }: any) => {
  return {
    authenticated: Boolean(locals.sessionToken)
  };
};

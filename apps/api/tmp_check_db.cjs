const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  const users = await p.user.findMany({ take: 20 });
  const providers = await p.providerConfig.findMany({ select: { id:true, key:true, enabled:true, isBuiltIn:true, kind:true }, orderBy: { key:'asc' } });
  console.log(JSON.stringify({ users, providers }, null, 2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });

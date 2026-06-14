const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  try {
    const users = await p.user.findMany({ take: 50 });
    const providers = await p.providerConfig.findMany({ take: 100 });
    console.log(JSON.stringify({ users, providerCount: providers.length }, null, 2));
  } finally {
    await p.$disconnect();
  }
})();

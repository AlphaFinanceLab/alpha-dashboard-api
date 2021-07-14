# Alpha dashboard api

Ref:
https://docs.google.com/document/d/1ThySLHlsDl6NGk9fWr6lyxa0AwhqkLt3WDpmVmuautg/edit


## Smart Contracts

## Token

- BSC ALPHA TOKEN 0xa1faa113cbe53436df28ff0aee54275c13b40975

### Banks

- Homora v1 ETH: 0x67b66c99d3eb37fa76aa3ed1ff33e8e39f0b9c7a

- Homora v1 BSC: 0x3bb5f6285c312fc7e1877244103036ebbeda193d
  * This are proxy contracts, also using the bank abi from the implementation deployed contract at 0x35cfacc93244fc94d26793cd6e68f59976380b3e

- Homora v2: 0xba5eBAf3fc1Fcca67147050Bf80462393814E54B

### V2 Safe Boxes
* SafeBoxETH 0xeEa3311250FE4c3268F8E684f7C87A82fF183Ec1

* SafeBoxDAI 0xee8389d235E092b2945fE363e97CDBeD121A0439

* SafeBoxUSDT 0x020eDC614187F9937A1EfEeE007656C6356Fb13A

* SafeBoxUSDC 0x08bd64BFC832F1C2B3e07e634934453bA7Fa2db2

* SafeBoxYFI 0xe52557bf7315Fd5b38ac0ff61304cb33BB973603

* SafeBoxDPI 0xd80CE6816f263C3cA551558b2034B61bc9852b97

* SafeBoxSNX 0x4d38b1ac1fad488e22282db451613EDd10434bdC

* SafeBoxsUSD 0x8897cA3e1B9BC5D5D715b653f186Cc7767bD4c66

* SafeBoxLINK 0xb59Ecdf6C2AEA5E67FaFbAf912B26658d43295Ed

* SafeBoxWBTC 0xE520679df7E32600D9B2Caf50bD5a4337ea3CF89

* SafeBoxUNI 0x6cdd8cBcFfB3821bE459f6fCaC647a447E56c999

* SafeBoxSUSHI 0x2ABBA23Bdc48245f5F68661E390da243755B569f


# SETUP

References:
[Prisma setup](https://www.prisma.io/docs/getting-started/setup-prisma/start-from-scratch/install-prisma-client-typescript-postgres/)
[Nvm setup](https://github.com/nvm-sh/nvm)
[Mercurius codegen](https://github.com/mercurius-js/mercurius/blob/master/docs/typescript.md)

Install yarn, nvm, nodejs, have a postgresql db, edit `.env` file. Then run:
```sh
yarn install
npx prisma generate
npx prisma migrate dev --name init 
```

* Prisma is a library that includes schema definition, migration and query tooling. Db settings and definitions
are at `./prisma/schema.prisma`



# About data mining

To sync all event data from the set of BSC smart contracts, run:
```
yarn bsc:sync_events
```

This will try to fill all the new events at the bank contract (since the last block stored at db or from the contract starting block), and fill the EventsBSC db table. While doing sync, there are many contract requests done (to Masterchef, to coingecko, to goblin contract, to lp contract, etc) that could fail, the script tries to retry the different parts, while building the object at the db. Most of the dinamic values are stored as jsonb postgres objects. Each event payload is stored at the `returnValues` table field, and the dynamic values are stored as jsonb at `contextValues`, including coingecko, lp, masterchef, gobling, etc.


## Backup and restore db

For backup (update arguments accordingly):
```
pg_dump --file ./backup-db-14-07-2021 --dbname=postgresql://postgres:1234@localhost:5432/alpha_finance --verbose --format=c --blobs --no-owner --section=pre-data --section=data --section=post-data --no-privileges --encoding "UTF8"
```

To restore from a dump (update settings accordingly):

```
createdb -h localhost -U postgres alpha_finance_backup
pg_restore --dbname=postgresql://postgres:1234@localhost:5432/alpha_finance_backup --section=pre-data --section=data --section=post-data --no-owner --no-privileges --verbose "./backup-db-14-07-2021"
```

1. Generate a migration file

  IF IT'S ADDED TO SCRIPTS IN package.json then do:
     npm run migration:generate ./migrations/<MigrationName>    //ex:  npm run migration:generate ./migrations/SETonDeletetoSETNULL
  ELSE:
      npx typeorm migration:generate ./src/migrations/<MigrationName> -d ./src/data-source.mjs --outputJs     
    // This will force TypeORM to generate .js migration directly.

    ex:- npx typeorm migration:generate ./migrations/AddVendorStatsTable -d ./config/data-source.mjs --outputJs

2. Run the migration on DB

  IF IT'S ADDED TO SCRIPTS IN package.json then do:
    npm run migration:run  
  ELSE:
    npx typeorm migration:run -d ./config/data-source.mjs

3. On Render, you’ll also need to run the migration after deployment (because synchronize is false).

  run the migration locally against the Render DB URL:

    DATABASE_URL="postgres://..." npx typeorm migration:run -d ./config/data-source.mjs

4. TO REVERT 

  IF IT'S ADDED TO SCRIPTS IN package.json then do:
    npm run migration:revert  
  ELSE:
    npx typeorm migration:revert -d ./config/data-source.mjs
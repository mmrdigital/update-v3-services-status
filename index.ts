import { writeFileSync } from "fs";
import { generateResolverStatus } from "./servicesMigration";
import { updateServices } from "./updateServices";

const statusFilePath =
  "/Users/nicolasgomeztoua/Desktop/work/updateNotion/migration_status.json";

const resolverStatus = generateResolverStatus();
writeFileSync(statusFilePath, JSON.stringify(resolverStatus, null, 2));

console.log("Resolver status has been written to:", statusFilePath);

updateServices(statusFilePath);

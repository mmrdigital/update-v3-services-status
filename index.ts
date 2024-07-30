import { writeFileSync } from "fs";
import { generateResolverStatus } from "./servicesMigration";
import { updateServices } from "./updateServices";

const statusFilePath =
  "";

const resolverStatus = generateResolverStatus();
writeFileSync(statusFilePath, JSON.stringify(resolverStatus, null, 2));

console.log("Resolver status has been written to:", statusFilePath);

updateServices(statusFilePath);

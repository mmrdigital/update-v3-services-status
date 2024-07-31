import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

interface ResolverInfo {
  name: string;
  type: "admin" | "api" | "scheduled" | "unknown";
  operation: "mutation" | "query" | "subscription" | "task" | "unknown";
  status: string;
}

interface ResolverStatus {
  [key: string]: ResolverInfo;
}

interface EnvironmentConfig {
  local?: boolean;
  dev?: boolean;
  stage?: boolean;
  prod?: boolean;
}

const v3ResolversPath =
  "";

function parseResolverFile(filePath: string): ResolverInfo[] {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true
  );

  const resolvers: ResolverInfo[] = [];
  const imports: { [key: string]: string } = {};

  function visit(node: ts.Node) {
   if (ts.isImportDeclaration(node)) {
     const importPath = node.moduleSpecifier.getText().replace(/['"]/g, "");
     const importClause = node.importClause;
     if (importClause) {
       if (importClause.name) {
         imports[importClause.name.text] = importPath;
       }
       if (importClause.namedBindings) {
         if (ts.isNamespaceImport(importClause.namedBindings)) {
           const importName = importClause.namedBindings.name.getText();
           imports[importName] = importPath;
         } else if (ts.isNamedImports(importClause.namedBindings)) {
           importClause.namedBindings.elements.forEach((element) => {
             imports[element.name.text] = importPath;
           });
         }
       }
     }
   }

    if (ts.isObjectLiteralExpression(node)) {
      const resolverObjects = node.properties.filter(
        (prop): prop is ts.PropertyAssignment =>
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === "resolvers"
      );

      resolverObjects.forEach((obj) => {
        if (ts.isArrayLiteralExpression(obj.initializer)) {
          obj.initializer.elements.forEach((element) => {
            if (ts.isObjectLiteralExpression(element)) {
              const resolver = parseResolverObject(element, imports);
              if (resolver) {
                resolvers.push(resolver);
              }
            }
          });
        }
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return resolvers;
}

function parseResolverObject(
  obj: ts.ObjectLiteralExpression,
  imports: { [key: string]: string }
): ResolverInfo | null {
  let name = "";
  let type: "admin" | "api" | "scheduled" | "unknown" = "unknown";
  let operation: "mutation" | "query" | "subscription" | "task" | "unknown" =
    "unknown";
  let environments: EnvironmentConfig | undefined;
  let adminEnvironments: EnvironmentConfig | undefined;
  let isScheduled = false;

  obj.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop)) {
      if (ts.isIdentifier(prop.name) && prop.name.text === "name") {
        if (ts.isPropertyAccessExpression(prop.initializer)) {
          const fullName = prop.initializer.getText();
          name = fullName.split(".").pop()!;
          const importName = fullName.split(".")[0];

          // Check if the import is from @adminTypes
          const isAdminType = Object.entries(imports).some(
            ([key, value]) =>
              key === importName && value.includes("@adminTypes")
          );

          type = isAdminType ? "admin" : "api";
          operation = determineOperation(fullName);
        } else if (ts.isStringLiteral(prop.initializer)) {
          // Handle cases where the name is a string literal
          name = prop.initializer.text;
        }
      } else if (
        ts.isIdentifier(prop.name) &&
        prop.name.text === "environments"
      ) {
        environments = parseEnvironmentConfig(prop.initializer);
      } else if (
        ts.isIdentifier(prop.name) &&
        prop.name.text === "adminEnvironments"
      ) {
        adminEnvironments = parseEnvironmentConfig(prop.initializer);
      } else if (
        ts.isIdentifier(prop.name) &&
        prop.name.text === "scheduleInfo"
      ) {
        isScheduled = true;
      }
    }
  });

  if (isScheduled) {
    type = "scheduled";
    operation = "task";
  }

  const status = determineStatus(environments, adminEnvironments);

  return name ? { name, type, operation, status } : null;
}

function determineOperation(
  fullName: string
): "mutation" | "query" | "subscription" | "task" | "unknown" {
  if (fullName.includes("MUTATION")) return "mutation";
  if (fullName.includes("QUERY")) return "query";
  if (fullName.includes("SUBSCRIPTION")) return "subscription";
  if (fullName.includes("TASK")) return "task";
  return "unknown";
}

function parseEnvironmentConfig(node: ts.Expression): EnvironmentConfig {
  const config: EnvironmentConfig = {};
  if (ts.isObjectLiteralExpression(node)) {
    node.properties.forEach((prop) => {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const envName = prop.name.text as keyof EnvironmentConfig;
        config[envName] = prop.initializer.getText() === "true";
      }
    });
  }
  return config;
}

function determineStatus(
  environments?: EnvironmentConfig,
  adminEnvironments?: EnvironmentConfig
): string {
  const envs = adminEnvironments || environments;
  if (!envs || Object.keys(envs).length === 0) return "Deployed to Prod"; // If no environments, default to Prod
  if (envs.prod) return "Deployed to Prod";
  if (envs.stage) return "Deployed to Stage";
  if (envs.dev) return "Deployed to Dev";
  if (envs.local) return "Code Complete";
  return "In Progress"; // If environments exist but none are true, default to In Progress
}

export function generateResolverStatus(): ResolverStatus {
  const status: ResolverStatus = {};

  fs.readdirSync(v3ResolversPath).forEach((file) => {
    if (file.endsWith(".ts")) {
      const filePath = path.join(v3ResolversPath, file);
      const resolvers = parseResolverFile(filePath);
      resolvers.forEach((resolver) => {
        if (resolver) {
          status[resolver.name] = resolver;
        }
      });
    }
  });

  return status;
}

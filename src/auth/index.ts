export { RBACManager } from "./rbac"
export type { Permission, RoleName, Role, RBACUser, APICredential } from "./rbac"
export { AuthMiddleware } from "./middleware"
import { RBACManager } from "./rbac"
export const rbacManager = new RBACManager()

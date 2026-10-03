import { localDev, none, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

// Reviewers can use the prototype without a login or shared access code.
// MCP connection authentication is configured separately in connections/companies.ts.
export default eveChannel({
  auth: [vercelOidc(), localDev(), none()],
});

import {
  IPluginOdapGatewayConstructorOptions,
  OdapMessageType,
  PluginOdapGateway,
} from "../../../../main/typescript/gateway/plugin-odap-gateway";
import {
  SessionData,
  TransferCompleteV1Request,
} from "../../../../main/typescript/generated/openapi/typescript-axios/api";
import { v4 as uuidV4 } from "uuid";
import { SHA256 } from "crypto-js";
import { randomInt } from "crypto";

let sourceGatewayConstructor: IPluginOdapGatewayConstructorOptions;
let recipientGatewayConstructor: IPluginOdapGatewayConstructorOptions;
let pluginSourceGateway: PluginOdapGateway;
let pluginRecipientGateway: PluginOdapGateway;
let dummyCommitFinalResponseMessageHash: string;
let dummyTransferCommenceResponseMessageHash: string;
let sessionData: SessionData;
let sessionID: string;
let sequenceNumber: number;

beforeEach(() => {
  sourceGatewayConstructor = {
    name: "plugin-odap-gateway#sourceGateway",
    dltIDs: ["DLT2"],
    instanceId: uuidV4(),
  };
  recipientGatewayConstructor = {
    name: "plugin-odap-gateway#recipientGateway",
    dltIDs: ["DLT1"],
    instanceId: uuidV4(),
  };

  pluginSourceGateway = new PluginOdapGateway(sourceGatewayConstructor);
  pluginRecipientGateway = new PluginOdapGateway(recipientGatewayConstructor);

  dummyCommitFinalResponseMessageHash = SHA256(
    "commitFinalResponseMessageData",
  ).toString();

  dummyTransferCommenceResponseMessageHash = SHA256(
    "transferCommenceResponseMessageData",
  ).toString();

  sessionData = {
    sourceGatewayPubkey: pluginSourceGateway.pubKey,
    recipientGatewayPubkey: pluginRecipientGateway.pubKey,
    commitFinalResponseMessageHash: dummyCommitFinalResponseMessageHash,
    transferCommenceMessageRequestHash: dummyTransferCommenceResponseMessageHash,
    step: 2,
  };

  sessionID = uuidV4();
  sequenceNumber = randomInt(100);

  pluginSourceGateway.sessions.set(sessionID, sessionData);
  pluginRecipientGateway.sessions.set(sessionID, sessionData);
});

test("dummy test for transfer complete flow", async () => {
  const transferCompleteRequestMessage: TransferCompleteV1Request = {
    sessionID: sessionID,
    messageType: OdapMessageType.TransferCompleteRequest,
    clientIdentityPubkey: pluginSourceGateway.pubKey,
    serverIdentityPubkey: pluginRecipientGateway.pubKey,
    clientSignature: "",
    hashTransferCommence: dummyTransferCommenceResponseMessageHash,
    hashCommitFinalAck: dummyCommitFinalResponseMessageHash,
    sequenceNumber: sequenceNumber,
  };

  transferCompleteRequestMessage.clientSignature = pluginSourceGateway.bufArray2HexStr(
    pluginSourceGateway.sign(JSON.stringify(transferCompleteRequestMessage)),
  );

  const response = await pluginRecipientGateway.transferCompleteReceived(
    transferCompleteRequestMessage,
  );

  expect(response.ok).toBe("true");
});

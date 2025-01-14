import { LoggerProvider } from "@hyperledger/cactus-common";
import {
  LockEvidenceV1Request,
  LockEvidenceV1Response,
} from "../../generated/openapi/typescript-axios";
import { OdapMessageType, PluginOdapGateway } from "../plugin-odap-gateway";
import { SHA256 } from "crypto-js";

const log = LoggerProvider.getOrCreate({
  level: "INFO",
  label: "odap-lock-evidence-helper",
});

export async function lockEvidence(
  request: LockEvidenceV1Request,
  odap: PluginOdapGateway,
): Promise<LockEvidenceV1Response> {
  const fnTag = `${odap.className}#lockEvidence()`;
  log.info(
    `server gateway receives LockEvidenceRequestMessage: ${JSON.stringify(
      request,
    )}`,
  );

  const sessionData = odap.sessions.get(request.sessionID);
  if (sessionData == undefined || sessionData.step == undefined) {
    throw new Error(
      `${fnTag}, session Id does not correspond to any open session`,
    );
  }

  await odap.storeOdapLog(
    {
      phase: "p2",
      step: sessionData.step.toString(),
      type: "exec",
      operation: "lock",
      nodes: `${odap.pubKey}`,
    },
    `${sessionData.id}-${sessionData.step.toString()}`,
  );

  // Calculate the hash here to avoid changing the object and the hash
  const lockEvidenceRequestMessageHash = SHA256(
    JSON.stringify(request),
  ).toString();

  log.info(
    `LockEvidenceRequestMessage hash is: ${lockEvidenceRequestMessageHash}`,
  );

  await checkValidLockEvidenceRequest(request, odap);

  await odap.storeOdapLog(
    {
      phase: "p2",
      step: sessionData.step.toString(),
      type: "done",
      operation: "lock",
      nodes: `${odap.pubKey}`,
    },
    `${sessionData.id}-${sessionData.step.toString()}`,
  );

  const lockEvidenceResponseMessage: LockEvidenceV1Response = {
    messageType: OdapMessageType.LockEvidenceResponse,
    clientIdentityPubkey: request.clientIdentityPubkey,
    serverIdentityPubkey: request.serverIdentityPubkey,
    hashLockEvidenceRequest: lockEvidenceRequestMessageHash,
    // server transfer number
    serverSignature: "",
    sequenceNumber: request.sequenceNumber,
  };

  lockEvidenceResponseMessage.serverSignature = odap.bufArray2HexStr(
    await odap.sign(JSON.stringify(lockEvidenceResponseMessage)),
  );

  storeSessionData(request, lockEvidenceResponseMessage, odap);

  await odap.storeOdapLog(
    {
      phase: "p2",
      step: sessionData.step.toString(),
      type: "ack",
      operation: "lock",
      nodes: `${odap.pubKey}->${request.clientIdentityPubkey}`,
    },
    `${sessionData.id}-${sessionData.step.toString()}`,
  );

  sessionData.step++;

  return lockEvidenceResponseMessage;
}

async function checkValidLockEvidenceRequest(
  request: LockEvidenceV1Request,
  odap: PluginOdapGateway,
): Promise<void> {
  const fnTag = `${odap.className}#checkValidLockEvidenceRequest()`;

  if (request.messageType != OdapMessageType.LockEvidenceRequest) {
    throw new Error(`${fnTag}, wrong message type for LockEvidenceRequest`);
  }

  const sourceClientSignature = new Uint8Array(
    Buffer.from(request.clientSignature, "hex"),
  );

  const sourceClientPubkey = new Uint8Array(
    Buffer.from(request.clientIdentityPubkey, "hex"),
  );

  const signature = request.clientSignature;
  request.clientSignature = "";
  if (
    !odap.verifySignature(
      JSON.stringify(request),
      sourceClientSignature,
      sourceClientPubkey,
    )
  ) {
    await odap.Revert(request.sessionID);
    throw new Error(
      `${fnTag}, LockEvidenceRequest message signature verification failed`,
    );
  }
  request.clientSignature = signature;

  if (
    request.lockEvidenceClaim == undefined ||
    new Date() > new Date(request.lockEvidenceExpiration)
  ) {
    await odap.Revert(request.sessionID);
    throw new Error(`${fnTag}, invalid or expired lock evidence claim`);
  }

  const sessionData = odap.sessions.get(request.sessionID);
  if (sessionData === undefined) {
    throw new Error(`${fnTag}, sessionID non exist`);
  }

  if (
    sessionData.transferCommenceMessageResponseHash !=
    request.hashCommenceAckRequest
  ) {
    await odap.Revert(request.sessionID);
    throw new Error(`${fnTag}, previous message hash does not match`);
  }
}

function storeSessionData(
  request: LockEvidenceV1Request,
  response: LockEvidenceV1Response,
  odap: PluginOdapGateway,
): void {
  const fnTag = `${odap.className}#()storeSessionData`;
  const sessionData = odap.sessions.get(request.sessionID);

  if (sessionData == undefined) {
    throw new Error(`${fnTag}, session data is undefined`);
  }

  sessionData.lockEvidenceResponseMessageHash = SHA256(
    JSON.stringify(response),
  ).toString();
  sessionData.lockEvidenceRequestMessageHash = SHA256(
    JSON.stringify(request),
  ).toString();

  sessionData.clientSignatureLockEvidenceRequestMessage =
    request.clientSignature;
  sessionData.serverSignatureLockEvidenceResponseMessage =
    response.serverSignature;

  odap.sessions.set(request.sessionID, sessionData);
}

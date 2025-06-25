/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ClientMetadata,
  LoadCodeAssistResponse,
  OnboardUserRequest,
} from './types.js';
import { CodeAssistServer } from './server.js';
import { OAuth2Client } from 'google-auth-library';

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      'This account requires settings the GOOGLE_CLOUD_PROJECT env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
  }
}

/**
 *
 * @param projectId the user's project id, if any
 * @returns the user's actual project id
 */
export async function setupUser(authClient: OAuth2Client): Promise<string> {
  let projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const caServer = new CodeAssistServer(authClient, projectId);

  const clientMetadata: ClientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
    duetProject: projectId,
  };

  // TODO: Support Free Tier user without projectId.
  const loadRes = await caServer.loadCodeAssist({
    cloudaicompanionProject: projectId,
    metadata: clientMetadata,
  });

  if (!projectId && loadRes.cloudaicompanionProject) {
    projectId = loadRes.cloudaicompanionProject;
  }
  if (!projectId || projectId === '') {
    throw new ProjectIdRequiredError();
  }

  const onboardReq: OnboardUserRequest = {
    tierId: getOnboardTier(loadRes),
    cloudaicompanionProject: projectId,
    metadata: clientMetadata,
  };

  // Poll onboardUser until long running operation is complete.
  let lroRes = await caServer.onboardUser(onboardReq);
  while (!lroRes.done) {
    await new Promise((f) => setTimeout(f, 5000));
    lroRes = await caServer.onboardUser(onboardReq);
  }
  return projectId;
}

function getOnboardTier(res: LoadCodeAssistResponse): string {
  if (res.currentTier) {
    return res.currentTier.id;
  }
  for (const tier of res.allowedTiers || []) {
    if (tier.isDefault) {
      return tier.id;
    }
  }
  return 'standard-tier';
}

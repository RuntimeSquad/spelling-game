const { session } = require("./cloud-session.cjs");
const fs = require("node:fs/promises");
(async () => {
  const { project, request } = await session();
  const plan = JSON.parse(
    await fs.readFile("config/runtime-access-request.json", "utf8"),
  );
  if (project !== plan.project || plan.createServiceAccountKeys !== false)
    throw Error("Unexpected access plan");
  const email = plan.serviceAccount,
    member = "serviceAccount:" + email;
  const saUrl = `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${email}`;
  try {
    await request(saUrl);
  } catch (e) {
    if (!e.message.includes("404")) throw e;
    await request(
      `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,
      "POST",
      {
        accountId: "spellbee-runtime",
        serviceAccount: { displayName: "Spell-Bee runtime (keyless)" },
      },
    );
  }
  const roleName = `projects/${project}/roles/${plan.customRole.roleId}`;
  const roleUrl = "https://iam.googleapis.com/v1/" + roleName;
  let custom;
  try {
    custom = await request(roleUrl);
  } catch (e) {
    if (!e.message.includes("404")) throw e;
    custom = await request(
      `https://iam.googleapis.com/v1/projects/${project}/roles`,
      "POST",
      {
        roleId: plan.customRole.roleId,
        role: {
          title: plan.customRole.title,
          stage: plan.customRole.stage,
          includedPermissions: plan.customRole.includedPermissions,
        },
      },
    );
  }
  if (
    JSON.stringify([...custom.includedPermissions].sort()) !==
    JSON.stringify([...plan.customRole.includedPermissions].sort())
  )
    throw Error("Existing custom role has different permissions; unchanged");
  const policyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
  const policy = await request(policyUrl + ":getIamPolicy", "POST", {});
  for (const role of [...plan.projectRoles, roleName]) {
    let b = (policy.bindings ||= []).find(
      (b) => b.role === role && !b.condition,
    );
    if (!b) policy.bindings.push((b = { role, members: [] }));
    if (!b.members.includes(member)) b.members.push(member);
  }
  await request(policyUrl + ":setIamPolicy", "POST", { policy });
  const bucketUrl = `https://storage.googleapis.com/storage/v1/b/${plan.bucketRole.bucket}/iam`;
  const bp = await request(bucketUrl + "?optionsRequestedPolicyVersion=3");
  bp.version = 3;
  const condition = {
    title: "SpellBeeApprovedAudioRead",
    expression: `resource.name.startsWith('projects/_/buckets/${plan.bucketRole.bucket}/objects/audio/')`,
  };
  let b = (bp.bindings ||= []).find(
    (b) =>
      b.role === plan.bucketRole.role &&
      b.condition?.expression === condition.expression,
  );
  if (!b)
    bp.bindings.push(
      (b = { role: plan.bucketRole.role, members: [], condition }),
    );
  for (const m of [member, "user:curtiscolly@gmail.com"])
    if (!b.members.includes(m)) b.members.push(m);
  await request(bucketUrl, "PUT", bp);
  const verified = await request(policyUrl + ":getIamPolicy", "POST", {}),
    vb = await request(bucketUrl + "?optionsRequestedPolicyVersion=3");
  for (const role of [...plan.projectRoles, roleName])
    if (
      !verified.bindings.some(
        (b) => b.role === role && b.members.includes(member),
      )
    )
      throw Error("Runtime grant readback failed");
  if (
    !vb.bindings.some(
      (b) =>
        b.role === plan.bucketRole.role &&
        b.condition?.expression === condition.expression &&
        b.members.includes(member) &&
        b.members.includes("user:curtiscolly@gmail.com"),
    )
  )
    throw Error("Audio read grant readback failed");
  await fs.writeFile(
    "artifacts/production-review/runtime-access-verified.json",
    JSON.stringify(
      {
        project,
        email,
        roles: [...plan.projectRoles, roleName],
        bucket: plan.bucketRole,
        condition,
        operator: "curtiscolly@gmail.com",
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "Verified approved narrow runtime roles and audio-only reader grants. No keys created.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

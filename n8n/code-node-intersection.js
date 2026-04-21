function normalizeUsername(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^@+/, "");
  return normalized.length > 0 ? normalized : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickUsername(obj) {
  if (!obj || typeof obj !== "object") return null;
  const candidates = [
    obj.username,
    obj.userName,
    obj.ownerUsername,
    obj.user?.username,
    obj.owner?.username,
    obj.author?.username
  ];

  for (const candidate of candidates) {
    const parsed = normalizeUsername(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function datasetToUsernameSet(items) {
  const result = new Set();
  for (const item of asArray(items)) {
    const username = pickUsername(item);
    if (username) result.add(username);
  }
  return result;
}

function repostContainsTargetPost(repostItems, targetShortcode, targetUrl) {
  const code = String(targetShortcode || "").trim().toLowerCase();
  const postUrl = String(targetUrl || "").trim().toLowerCase();

  for (const item of asArray(repostItems)) {
    const observedValues = [
      item?.shortcode,
      item?.postShortcode,
      item?.code,
      item?.url,
      item?.postUrl,
      item?.permalink
    ]
      .filter(Boolean)
      .map((x) => String(x).trim().toLowerCase());

    if (code && observedValues.some((x) => x === code || x.includes(`/${code}`))) return true;
    if (postUrl && observedValues.some((x) => x === postUrl || x.includes(postUrl))) return true;
  }

  return false;
}

try {
  const input = items?.[0]?.json || {};

  const requestId = input.request_id;
  const postUrl = input.post_url;
  const postShortcode = input.post_shortcode || "";

  const targetGroup = Array.from(
    new Set(
      asArray(input.target_group)
        .map(normalizeUsername)
        .filter(Boolean)
    )
  );

  if (!requestId) throw new Error("request_id ausente");
  if (!postUrl) throw new Error("post_url ausente");
  if (targetGroup.length === 0) throw new Error("target_group vacío o inválido");

  const likesSet = datasetToUsernameSet(input.likers_items);
  const commentsSet = datasetToUsernameSet(input.comments_items);

  const likes = targetGroup.filter((u) => likesSet.has(u));
  const comments = targetGroup.filter((u) => commentsSet.has(u));

  const repostsByUser = asArray(input.reposts_by_user);
  const reposts = [];

  for (const row of repostsByUser) {
    const username = normalizeUsername(row?.username);
    if (!username || !targetGroup.includes(username)) continue;

    if (repostContainsTargetPost(row?.items, postShortcode, postUrl)) {
      reposts.push(username);
    }
  }

  const uniqueSorted = (arr) => Array.from(new Set(arr)).sort();

  return [
    {
      json: {
        request_id: requestId,
        post_url: postUrl,
        status: "done",
        likes: uniqueSorted(likes),
        comments: uniqueSorted(comments),
        reposts: uniqueSorted(reposts),
        saved_metric_message:
          "Métrica de guardados inaccesible debido a las restricciones de privacidad de la plataforma",
        error: null,
        updated_at: new Date().toISOString()
      }
    }
  ];
} catch (error) {
  return [
    {
      json: {
        status: "error",
        error: error?.message || "Error no controlado en nodo de intersección",
        saved_metric_message:
          "Métrica de guardados inaccesible debido a las restricciones de privacidad de la plataforma"
      }
    }
  ];
}

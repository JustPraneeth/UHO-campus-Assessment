function clusterCandidates(candidates) {
  const completed = candidates.filter((candidate) => candidate.status === "completed");
  if (completed.length < 2) return { candidates, profiles: [] };

  const categories = [...new Set(completed.flatMap((candidate) =>
    (candidate.sectionScores || []).map((section) => section.category)
  ))].sort();
  const dimensions = categories.length ? categories : ["Overall"];
  const vectors = completed.map((candidate) => dimensions.map((category) => {
    if (category === "Overall") return candidate.percentage;
    return candidate.sectionScores?.find((section) => section.category === category)?.percentage || 0;
  }));
  const clusterCount = Math.min(3, completed.length);
  let centroids = Array.from({ length: clusterCount }, (_, index) =>
    [...vectors[Math.floor((index * vectors.length) / clusterCount)]]
  );
  let assignments = [];

  for (let iteration = 0; iteration < 12; iteration += 1) {
    assignments = vectors.map((vector) => {
      let closest = 0;
      let smallestDistance = Infinity;
      centroids.forEach((centroid, index) => {
        const distance = vector.reduce((sum, value, dimension) =>
          sum + (value - centroid[dimension]) ** 2, 0
        );
        if (distance < smallestDistance) {
          smallestDistance = distance;
          closest = index;
        }
      });
      return closest;
    });

    centroids = centroids.map((centroid, clusterIndex) => {
      const members = vectors.filter((_, index) => assignments[index] === clusterIndex);
      if (!members.length) return centroid;
      return centroid.map((_, dimension) =>
        members.reduce((sum, vector) => sum + vector[dimension], 0) / members.length
      );
    });
  }

  const profiles = centroids.map((centroid, clusterIndex) => {
    const memberCount = assignments.filter((assignment) => assignment === clusterIndex).length;
    const strongestCategory = dimensions[centroid.indexOf(Math.max(...centroid))];
    return {
      label: `Profile ${clusterIndex + 1}`,
      candidateCount: memberCount,
      averagePercentage: memberCount
        ? Math.round(centroid.reduce((sum, score) => sum + score, 0) / centroid.length * 100) / 100
        : 0,
      relativeStrength: strongestCategory,
    };
  }).filter((profile) => profile.candidateCount);

  completed.forEach((candidate, index) => {
    candidate.performanceProfile = `Profile ${assignments[index] + 1}`;
  });

  return { candidates, profiles };
}

module.exports = { clusterCandidates };
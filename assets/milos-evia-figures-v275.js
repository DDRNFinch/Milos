(function (global) {
  'use strict';

  const originalQr = global.MilosQR;
  const originalCore = global.MilosCore;
  if (!originalQr || !originalCore) return;

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normaliseFiguresPayload(value) {
    if (!value || value.t !== 'evia-figures-v2' || Number(value.v) !== 2 || !Array.isArray(value.f)) return null;
    const figures = value.f;
    if (figures.length < 20) throw new Error('This Evia figures QR is incomplete.');
    const course = Array.isArray(value.c) ? value.c : [];
    const courseId = String(course[0] || '').trim();
    if (!courseId) throw new Error('This Evia figures QR does not include a course.');

    return {
      v: 2,
      t: 'progress',
      protocolVersion: 2,
      c: courseId,
      u: numberOrNull(value.u) || Date.now(),
      l: numberOrNull(figures[10]) || 0,
      lt: numberOrNull(figures[7]) || 0,
      ec: numberOrNull(figures[13]) || 0,
      eviaFiguresVersion: 2,
      timeOnCoursePercent: numberOrNull(figures[0]),
      courseCompleted: numberOrNull(figures[1]),
      courseTotal: numberOrNull(figures[2]),
      courseProgressPercent: numberOrNull(figures[3]),
      collegeAttendancePercent: numberOrNull(figures[4]),
      workplaceAttendancePercent: numberOrNull(figures[5]),
      attendancePercent: numberOrNull(figures[6]),
      learningRequiredHours: numberOrNull(figures[7]),
      collegeLearningHours: numberOrNull(figures[8]),
      learnerLearningHours: numberOrNull(figures[9]),
      learningHours: numberOrNull(figures[10]) || 0,
      learningPercent: numberOrNull(figures[11]),
      learningEntryCount: numberOrNull(figures[12]),
      evidenceCount: numberOrNull(figures[13]) || 0,
      targetCount: numberOrNull(figures[14]),
      completedTargetCount: numberOrNull(figures[15]),
      outstandingTargetCount: numberOrNull(figures[16]),
      epaConfidencePercent: numberOrNull(figures[17]),
      epaPracticePercent: numberOrNull(figures[18]),
      epaReadinessPercent: numberOrNull(figures[19])
    };
  }

  function parsePayload(input) {
    const text = String(input == null ? '' : input).trim();
    if (text.startsWith('{')) {
      try {
        const value = JSON.parse(text);
        const mapped = normaliseFiguresPayload(value);
        if (mapped) return { type:'progress', value:mapped, raw:text, eviaFigures:true };
      } catch (error) {
        if (/Evia figures QR/.test(String(error && error.message))) throw error;
      }
    }
    return originalQr.parsePayload(input);
  }

  function sanitiseProgress(raw) {
    const snapshot = originalCore.sanitiseProgress(raw);
    if (!raw || Number(raw.eviaFiguresVersion) !== 2) return snapshot;
    snapshot.eviaFigures = {
      version: 2,
      timeOnCoursePercent: numberOrNull(raw.timeOnCoursePercent),
      courseCompleted: numberOrNull(raw.courseCompleted),
      courseTotal: numberOrNull(raw.courseTotal),
      courseProgressPercent: numberOrNull(raw.courseProgressPercent),
      attendance: {
        collegePercent: numberOrNull(raw.collegeAttendancePercent),
        workplacePercent: numberOrNull(raw.workplaceAttendancePercent),
        combinedPercent: numberOrNull(raw.attendancePercent)
      },
      learning: {
        requiredHours: numberOrNull(raw.learningRequiredHours),
        collegeHours: numberOrNull(raw.collegeLearningHours),
        learnerHours: numberOrNull(raw.learnerLearningHours),
        totalHours: numberOrNull(raw.learningHours),
        percent: numberOrNull(raw.learningPercent),
        entries: numberOrNull(raw.learningEntryCount)
      },
      evidenceCount: numberOrNull(raw.evidenceCount),
      targets: {
        total: numberOrNull(raw.targetCount),
        completed: numberOrNull(raw.completedTargetCount),
        outstanding: numberOrNull(raw.outstandingTargetCount)
      },
      epa: {
        confidencePercent: numberOrNull(raw.epaConfidencePercent),
        practicePercent: numberOrNull(raw.epaPracticePercent),
        readinessPercent: numberOrNull(raw.epaReadinessPercent)
      }
    };
    return snapshot;
  }

  function attachProgress(profileId, rawProgress) {
    if (!rawProgress || Number(rawProgress.eviaFiguresVersion) !== 2) {
      return originalCore.attachProgress(profileId, rawProgress);
    }

    const snapshot = sanitiseProgress(rawProgress);
    const profiles = originalCore.getProfiles();
    const index = profiles.findIndex((profile) => profile.id === profileId);
    if (index < 0) throw new Error('Select a learner before importing progress.');
    const profile = Object.assign({}, profiles[index]);
    profile.courseRouteId = snapshot.courseRouteId;
    profile.startDate = snapshot.startDate || profile.startDate || '';
    profile.endDate = snapshot.endDate || profile.endDate || '';
    if (snapshot.sharedId) profile.sharedId = snapshot.sharedId;
    profile.snapshots = [snapshot, ...(Array.isArray(profile.snapshots) ? profile.snapshots : [])].slice(0, 30);
    profile.updatedAt = Date.now();
    profiles[index] = profile;
    global.localStorage.setItem(originalCore.STORAGE.profiles, JSON.stringify(profiles));
    return JSON.parse(JSON.stringify(profile));
  }

  global.MilosQR = Object.freeze(Object.assign({}, originalQr, { parsePayload }));
  global.MilosCore = Object.freeze(Object.assign({}, originalCore, { sanitiseProgress, attachProgress }));
})(window);

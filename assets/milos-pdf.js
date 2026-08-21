(function (global) {
  "use strict";

  const BLUE = [44, 133, 247];
  const BLUE_DARK = [27, 91, 174];
  const BLUE_PALE = [235, 244, 255];
  const INK = [41, 43, 48];
  const MUTED = [105, 108, 116];
  const LINE = [224, 228, 234];
  const GREEN = [49, 126, 78];
  const AMBER = [170, 112, 14];
  const RED = [166, 67, 57];

  function pdfClass() {
    const value = global.jspdf && global.jspdf.jsPDF;
    if (!value) throw new Error("The offline PDF builder is unavailable.");
    return value;
  }

  function safe(value) {
    return String(value == null ? "" : value)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function filename(value) {
    return safe(value).replace(/[^a-z0-9 ._-]+/gi, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80) || "Milos-Document";
  }

  class Builder {
    constructor(title, subtitle, reference) {
      const JsPDF = pdfClass();
      this.doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      this.title = safe(title);
      this.subtitle = safe(subtitle);
      this.reference = safe(reference);
      this.margin = 16;
      this.width = 210;
      this.height = 297;
      this.y = 0;
      this.page = 0;
      this.newPage(true);
    }

    drawMark(x, y, size) {
      const doc = this.doc;
      doc.setDrawColor.apply(doc, BLUE);
      doc.setLineWidth(0.75);
      doc.circle(x, y, size, "S");
      doc.circle(x - size * 0.33, y - size * 0.06, size * 0.2, "S");
      doc.circle(x + size * 0.33, y - size * 0.06, size * 0.2, "S");
    }

    newPage(first) {
      if (!first) this.doc.addPage();
      this.page += 1;
      const doc = this.doc;
      doc.setFillColor(249, 251, 254);
      doc.rect(0, 0, this.width, this.height, "F");
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(this.margin - 2, 11, this.width - (this.margin - 2) * 2, 31, 4, 4, "F");
      this.drawMark(24, 26.3, 7.2);
      doc.setTextColor.apply(doc, INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14.5);
      doc.text(this.title, 36, 23.3);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      doc.setTextColor.apply(doc, MUTED);
      doc.text(this.subtitle, 36, 29.2);
      doc.setFontSize(6.8);
      doc.text(this.reference, 36, 34.2);
      doc.setDrawColor.apply(doc, BLUE);
      doc.setLineWidth(0.9);
      doc.line(this.margin, 45, this.width - this.margin, 45);
      this.y = 52;
    }

    ensure(height) {
      if (this.y + height <= this.height - 20) return;
      this.newPage(false);
    }

    section(title) {
      this.ensure(15);
      const doc = this.doc;
      doc.setFillColor.apply(doc, BLUE_PALE);
      doc.roundedRect(this.margin, this.y, this.width - this.margin * 2, 9, 2.5, 2.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.4);
      doc.setTextColor.apply(doc, BLUE_DARK);
      doc.text(safe(title).toUpperCase(), this.margin + 4, this.y + 5.9);
      this.y += 13;
    }

    paragraph(label, value, options) {
      const opts = options || {};
      const doc = this.doc;
      const text = safe(value) || opts.empty || "Not recorded";
      const width = opts.width || (this.width - this.margin * 2 - 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(opts.size || 8.2);
      const lines = doc.splitTextToSize(text, width);
      const needed = (label ? 7 : 0) + lines.length * (opts.leading || 4.3) + 7;
      this.ensure(needed);
      if (label) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.1);
        doc.setTextColor.apply(doc, MUTED);
        doc.text(safe(label).toUpperCase(), this.margin + 1, this.y);
        this.y += 5;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(opts.size || 8.2);
      doc.setTextColor.apply(doc, INK);
      doc.text(lines, this.margin + 1, this.y, { lineHeightFactor: 1.32 });
      this.y += lines.length * (opts.leading || 4.3) + 5;
    }

    keyValues(items) {
      const doc = this.doc;
      const cleanItems = (items || []).filter((item) => item && item[0]);
      const rowHeight = 12.5;
      this.ensure(Math.max(1, cleanItems.length) * rowHeight + 2);
      cleanItems.forEach((item, index) => {
        const top = this.y + index * rowHeight;
        doc.setFillColor(index % 2 ? 252 : 255, index % 2 ? 253 : 255, 255);
        doc.roundedRect(this.margin, top - 4, this.width - this.margin * 2, 10.5, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor.apply(doc, MUTED);
        doc.text(safe(item[0]), this.margin + 4, top + 1.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.7);
        doc.setTextColor.apply(doc, INK);
        const lines = doc.splitTextToSize(safe(item[1]) || "Not recorded", 102);
        doc.text(lines.slice(0, 2), this.width - this.margin - 4, top + 1.5, { align: "right", lineHeightFactor: 1.25 });
      });
      this.y += cleanItems.length * rowHeight + 3;
    }

    stats(items) {
      const doc = this.doc;
      const list = (items || []).slice(0, 4);
      const gap = 3;
      const width = (this.width - this.margin * 2 - gap * (list.length - 1)) / list.length;
      this.ensure(28);
      list.forEach((item, index) => {
        const x = this.margin + index * (width + gap);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor.apply(doc, LINE);
        doc.roundedRect(x, this.y, width, 22, 3, 3, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor.apply(doc, MUTED);
        doc.text(safe(item.label), x + width / 2, this.y + 6, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor.apply(doc, item.color || BLUE_DARK);
        doc.text(safe(item.value), x + width / 2, this.y + 14.5, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.7);
        doc.setTextColor.apply(doc, MUTED);
        doc.text(safe(item.note || ""), x + width / 2, this.y + 19, { align: "center" });
      });
      this.y += 28;
    }

    status(label, value) {
      this.ensure(13);
      const text = safe(value || "Not rated");
      const lower = text.toLowerCase();
      const color = lower.includes("off") || lower.includes("training required") ? RED : lower.includes("attention") || lower.includes("satisfactory") ? AMBER : GREEN;
      const doc = this.doc;
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(this.margin, this.y, this.width - this.margin * 2, 9.5, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${safe(label)}: ${text}`, this.margin + 4, this.y + 6.2);
      this.y += 14;
    }

    codeTable(rows, outcomeKey) {
      const doc = this.doc;
      const list = rows || [];
      if (!list.length) {
        this.paragraph("Criteria", "No criteria were recorded.");
        return;
      }
      list.forEach((row, index) => {
        const description = safe(row.description || "");
        doc.setFontSize(7.1);
        const lines = doc.splitTextToSize(description, 120).slice(0, 4);
        const height = Math.max(13, 7 + lines.length * 3.5);
        this.ensure(height + 2);
        if (index % 2 === 0) {
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(this.margin, this.y - 3.5, this.width - this.margin * 2, height, 2, 2, "F");
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.4);
        doc.setTextColor.apply(doc, BLUE_DARK);
        doc.text(safe(row.code), this.margin + 4, this.y + 1.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.1);
        doc.setTextColor.apply(doc, INK);
        doc.text(lines, this.margin + 27, this.y + 1.5, { lineHeightFactor: 1.25 });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        const outcome = safe(row[outcomeKey || "outcome"] || "Recorded");
        const lower = outcome.toLowerCase();
        doc.setTextColor.apply(doc, lower.includes("not") ? RED : lower.includes("partial") ? AMBER : GREEN);
        doc.text(outcome, this.width - this.margin - 4, this.y + 1.5, { align: "right" });
        this.y += height + 1;
      });
      this.y += 3;
    }

    targets(targets) {
      const list = (targets || []).filter((target) => target && target.title);
      if (!list.length) {
        this.paragraph("Actions for next review", "No actions were recorded.");
        return;
      }
      const doc = this.doc;
      list.forEach((target, index) => {
        const title = `${index + 1}. ${safe(target.title)}`;
        doc.setFontSize(7.7);
        const lines = doc.splitTextToSize(title, 130).slice(0, 4);
        const height = Math.max(14, 8 + lines.length * 4);
        this.ensure(height + 2);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor.apply(doc, LINE);
        doc.roundedRect(this.margin, this.y - 3, this.width - this.margin * 2, height, 2.4, 2.4, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.7);
        doc.setTextColor.apply(doc, INK);
        doc.text(lines, this.margin + 4, this.y + 2, { lineHeightFactor: 1.3 });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor.apply(doc, BLUE_DARK);
        const meta = [safe(target.code), target.dueDate ? `Due ${global.MilosCore.formatDate(target.dueDate, false)}` : ""].filter(Boolean).join(" · ");
        doc.text(meta || "Action", this.width - this.margin - 4, this.y + 2, { align: "right" });
        this.y += height + 2;
      });
    }

    signature(label, signature) {
      const record = signature || {};
      this.ensure(38);
      const doc = this.doc;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor.apply(doc, LINE);
      doc.roundedRect(this.margin, this.y, this.width - this.margin * 2, 32, 3, 3, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor.apply(doc, MUTED);
      doc.text(safe(label).toUpperCase(), this.margin + 4, this.y + 6);
      if (record.dataUrl) {
        try { doc.addImage(record.dataUrl, "JPEG", this.margin + 4, this.y + 8, 48, 15, undefined, "FAST"); } catch (_) {}
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, INK);
      doc.text(safe(record.name) || "Not signed", this.width - this.margin - 4, this.y + 14, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor.apply(doc, MUTED);
      doc.text(safe(record.role || ""), this.width - this.margin - 4, this.y + 19, { align: "right" });
      doc.text(record.signedAt ? global.MilosCore.formatDate(record.signedAt, true) : "Signature not captured", this.width - this.margin - 4, this.y + 25, { align: "right" });
      this.y += 38;
    }

    image(dataUrl, caption, isVideo) {
      if (!dataUrl) return;
      this.ensure(92);
      const doc = this.doc;
      const properties = doc.getImageProperties(dataUrl);
      const maxWidth = this.width - this.margin * 2;
      const maxHeight = 78;
      const ratio = Math.min(maxWidth / properties.width, maxHeight / properties.height);
      const width = properties.width * ratio;
      const height = properties.height * ratio;
      const x = this.margin + (maxWidth - width) / 2;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(this.margin, this.y, maxWidth, height + 12, 3, 3, "F");
      doc.addImage(dataUrl, "JPEG", x, this.y + 4, width, height, undefined, "FAST");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.7);
      doc.setTextColor.apply(doc, MUTED);
      doc.text(`${isVideo ? "Video still · " : "Photo · "}${safe(caption)}`, this.margin + 4, this.y + height + 9);
      this.y += height + 16;
    }

    qr(dataUrl, caption) {
      if (!dataUrl) return;
      this.ensure(60);
      const doc = this.doc;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor.apply(doc, LINE);
      doc.roundedRect(this.margin, this.y, this.width - this.margin * 2, 53, 3, 3, "FD");
      doc.addImage(dataUrl, "PNG", this.margin + 5, this.y + 5, 43, 43, undefined, "FAST");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor.apply(doc, BLUE_DARK);
      doc.text("Return to Evia", this.margin + 55, this.y + 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.3);
      doc.setTextColor.apply(doc, INK);
      const lines = doc.splitTextToSize(safe(caption), 105);
      doc.text(lines, this.margin + 55, this.y + 21, { lineHeightFactor: 1.35 });
      this.y += 59;
    }

    finish() {
      const pages = this.doc.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        this.doc.setPage(page);
        this.doc.setDrawColor.apply(this.doc, LINE);
        this.doc.setLineWidth(0.35);
        this.doc.line(this.margin, this.height - 15, this.width - this.margin, this.height - 15);
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(6.2);
        this.doc.setTextColor.apply(this.doc, MUTED);
        this.doc.text("Created locally in Milos · Assessor assistant", this.margin, this.height - 10);
        this.doc.text(`Page ${page} of ${pages}`, this.width - this.margin, this.height - 10, { align: "right" });
      }
    }
  }

  function snapshotRows(profile, course, snapshot) {
    return [
      ["Learner", profile.name],
      ["Course", course.title],
      ["Course dates", `${global.MilosCore.formatDate(profile.startDate, false)} to ${global.MilosCore.formatDate(profile.endDate, false)}`],
      ["Progress QR updated", snapshot && snapshot.importedAt ? global.MilosCore.formatDate(snapshot.importedAt, true) : "No progress QR imported"],
    ];
  }

  async function reviewPdf(review, profile, course, metrics) {
    const reference = `Review ${safe(review.id)} · ${global.MilosCore.formatDate(review.reviewDate, false)}`;
    const builder = new Builder("Apprenticeship Progress Review", "Milos · three-way progress review record", reference);
    const snapshot = review.snapshot || global.MilosCore.latestSnapshot(profile) || {};
    builder.section("Learner and programme");
    builder.keyValues(snapshotRows(profile, course, snapshot));
    builder.stats([
      { label: "Time on course", value: `${metrics.toc}%`, note: "elapsed" },
      { label: `${course.coverageLabel} coverage`, value: `${metrics.coverage}%`, note: `${metrics.completed}/${metrics.total}` },
      { label: course.learningLabel, value: `${Number(metrics.learningHours || 0).toFixed(1)}h`, note: `of ${Number(metrics.learningTarget || 0).toFixed(0)}h` },
      { label: "New since review", value: String((review.newCodes || []).length), note: course.coverageLabel },
    ]);

    builder.section("Review meeting");
    builder.keyValues([
      ["Review date", global.MilosCore.formatDate(review.reviewDate, false)],
      ["Meeting format", review.meetingFormat],
      ["Location / link", review.location || "Not recorded"],
      ["Next review", global.MilosCore.formatDate(review.nextReviewDate, false)],
      ["Provider representative", review.providerName],
      ["Employer representative", `${review.employerName || "Not recorded"} · ${review.employerAttendance || "Attendance not recorded"}`],
      ["Apprentice", profile.name],
    ]);
    if (review.employerContribution) builder.paragraph("Employer contribution where not attending", review.employerContribution);

    builder.section("Progress since the previous review");
    builder.paragraph("Previous actions and training delivered", review.previousActions);
    builder.paragraph("Evidence and training discussed or collected", review.trainingEvidence);
    builder.paragraph(`New ${course.coverageLabel} progress`, (review.newCodes || []).join(" · ") || `No new ${course.coverageLabel} codes identified from the latest Evia QR.`);
    builder.paragraph("Current Evia targets", (snapshot.targets || []).map((target) => `${target.title}${target.dueDate ? ` (due ${global.MilosCore.formatDate(target.dueDate, false)})` : ""}`).join("; ") || "No active Evia targets were included in the latest progress QR.");

    builder.section("Training plan and overall progress");
    builder.status("Overall position", review.overallStatus);
    builder.paragraph("Progress against the agreed training plan", review.overallProgress);
    builder.paragraph(`${course.learningLabel} progress and any slippage`, review.learningProgress);
    builder.paragraph("English, maths and mandatory qualifications", review.qualifications);
    builder.paragraph("Training plan changes", review.trainingPlanChanges);

    builder.section("Support, wellbeing and contributions");
    builder.paragraph("Concerns, changes of circumstance or support needs", review.supportNeeds);
    builder.paragraph("Wellbeing and safeguarding check", review.wellbeing);
    builder.paragraph("Apprentice comments", review.apprenticeComments);
    builder.paragraph("Employer comments", review.employerComments);
    builder.paragraph("Provider comments", review.providerComments);

    builder.section("Agreed actions for the next review");
    builder.targets(review.targets);
    builder.keyValues([["Next review date", global.MilosCore.formatDate(review.nextReviewDate, false)]]);

    builder.section("Declarations and signatures");
    builder.paragraph("Review summary", "The progress discussion and agreed actions have been shared with all parties. The provider and apprentice signatures below confirm this review record. Employer attendance or contribution is recorded above.");
    builder.signature("Provider signature", review.signatures && review.signatures.provider);
    builder.signature("Apprentice signature", review.signatures && review.signatures.apprentice);
    if (review.signatures && review.signatures.employer && review.signatures.employer.dataUrl) builder.signature("Employer signature", review.signatures.employer);
    builder.paragraph("Funding rules reference", "This record is structured around the progress-review requirements in paragraphs 102 to 103 of the 2026 to 2027 apprenticeship funding rules. The provider must apply the funding rules appropriate to the apprentice's start date and retain the review in its evidence pack.", { size: 6.8 });

    builder.finish();
    const outputName = `${filename(profile.name)}-Progress-Review-${review.reviewDate || new Date().toISOString().slice(0, 10)}.pdf`;
    builder.doc.save(outputName);
    return outputName;
  }

  async function observationPdf(observation, profile, course, qrPayload) {
    const reference = `Observation ${safe(observation.publicId || observation.id)} · ${global.MilosCore.formatDate(observation.observationDate, false)}`;
    const builder = new Builder("Assessor Observation Record", "Milos · course-mapped workplace observation", reference);
    const sections = global.MilosCore.normaliseObservationSections(observation.sections);
    const sectionLabel = sections.length > 1
      ? `${sections[0].opportunityTitle} + ${sections.length - 1} more`
      : sections.length === 1
        ? sections[0].opportunityTitle
        : observation.opportunityTitle || observation.jobTitle || "Course activity";
    builder.section("Learner and observation");
    builder.keyValues([
      ["Learner", profile.name],
      ["Course", course.title],
      ["Observation date", global.MilosCore.formatDate(observation.observationDate, false)],
      ["Start / finish", `${observation.startTime || "Not recorded"} to ${observation.endTime || "Not recorded"}`],
      ["Location", observation.location || "Not recorded"],
      ["Assessor", observation.assessorName],
      ["Observed activity", sectionLabel],
      ["Sections covered", sections.length ? String(sections.length) : "1"],
    ]);
    builder.status("Overall assessment", observation.rating);
    if (sections.length) {
      builder.paragraph("Sections observed", sections.map((section, index) => `${index + 1}. ${section.categoryTitle} > ${section.jobTitle} > ${section.opportunityTitle} (${section.codes.join(", ")})`).join("\n"));
    }
    builder.paragraph("Activity observed", observation.activityObserved);

    builder.section(`${course.coverageLabel} decisions`);
    builder.codeTable((observation.criteria || []).filter((criterion) => criterion.included !== false).map((criterion) => ({
      code: criterion.code,
      description: criterion.description,
      outcome: criterion.outcome,
    })), "outcome");

    builder.section("Assessor record");
    builder.paragraph("Safe working, PPE and controls", observation.safetyNotes);
    builder.paragraph("Performance, quality and checks", observation.qualityNotes);
    builder.paragraph("Knowledge questions and learner responses", observation.questionsAndAnswers);
    builder.paragraph("Assessor feedback", observation.feedback);
    builder.paragraph("Actions or further evidence required", observation.actions);

    const media = Array.isArray(observation.media) ? observation.media : [];
    if (media.length) {
      builder.section("Observation media");
      for (const item of media) {
        try {
          const stored = await global.MilosMedia.getFile(item.id);
          if (!stored) {
            builder.paragraph("Media", `${item.name || "Observation media"} · no longer available on this device.`);
            continue;
          }
          const type = String(stored.type || stored.blob.type || "");
          if (type.startsWith("image/") || type.startsWith("video/")) {
            const preview = await global.MilosMedia.mediaPreviewDataUrl(stored);
            builder.image(preview, stored.name || item.name, type.startsWith("video/"));
          } else {
            builder.paragraph("Audio evidence", `${stored.name || item.name} · ${Math.max(1, Math.round((stored.size || 0) / 1024))} KB · stored locally in Milos.`);
          }
        } catch (_) {
          builder.paragraph("Media", `${item.name || "Observation media"} · preview unavailable.`);
        }
      }
    }

    builder.ensure(72);
    builder.section("Authentication and return to Evia");
    builder.signature("Assessor signature", observation.signature);
    if (observation.learnerSignature && observation.learnerSignature.dataUrl) builder.signature("Learner acknowledgement", observation.learnerSignature);
    try {
      const qrData = global.MilosQR.dataUrl(qrPayload, 760);
      const observedCount = Array.isArray(observation.observedCodes) ? observation.observedCodes.length : 0;
      builder.qr(qrData, `Scan this QR in Evia to add a blue o to ${observedCount} observed ${course.coverageLabel} ${observedCount === 1 ? "item" : "items"}. The QR contains no names, photos, signatures or contact details.`);
    } catch (_) {}
    builder.paragraph("Observation declaration", "The assessor confirms that the decisions in this record are based on activity personally observed and the mapped criteria shown above.", { size: 7.2 });

    builder.finish();
    const outputName = `${filename(profile.name)}-Observation-${observation.observationDate || new Date().toISOString().slice(0, 10)}.pdf`;
    builder.doc.save(outputName);
    return outputName;
  }

  global.MilosPDF = Object.freeze({
    observationPdf,
    reviewPdf,
  });
})(window);

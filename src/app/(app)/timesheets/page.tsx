import dayjs from "dayjs";

import { api } from "~/trpc/server";

import { TimesheetEditor } from "./timesheet-editor";

export default async function TimesheetsPage() {
  const [me, visibleUsers] = await Promise.all([
    api.user.me(),
    api.timesheet.visibleUsers(),
  ]);

  return (
    <TimesheetEditor
      me={{
        id: me.id,
        role: me.role,
        editorKeybinding: me.editorKeybinding,
        cursorStyle: me.cursorStyle,
        showLineNumbers: me.showLineNumbers,
        workdays: me.workdays,
        hoursPerWorkday: Number(me.hoursPerWorkday),
        monthlyHoursGoal: me.monthlyHoursGoal ? Number(me.monthlyHoursGoal) : null,
      }}
      visibleUsers={visibleUsers}
      defaultPeriod={dayjs().format("YYYYMM")}
    />
  );
}

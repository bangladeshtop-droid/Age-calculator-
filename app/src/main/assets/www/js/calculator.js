// AgeBee Pro — Precise Age Calculator Logic

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export function getDaysInMonth(year, month) {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

export function calculatePreciseAge(birthYear, birthMonth, birthDay) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentDay = now.getDate();

  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);

  if (isNaN(birthDate.getTime())) {
    throw new Error("Invalid birth date provided.");
  }

  if (birthDate > now) {
    throw new Error("Birth date cannot be in the future.");
  }

  let years = currentYear - birthYear;
  let months = currentMonth - birthMonth;
  let days = currentDay - birthDay;

  if (days < 0) {
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    days += getDaysInMonth(prevMonthYear, prevMonth);
    months -= 1;
  }

  if (months < 0) {
    months += 12;
    years -= 1;
  }

  const diffTime = Math.abs(now.getTime() - birthDate.getTime());
  const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.floor(totalDays / 7);
  const totalMonths = (years * 12) + months;

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayBorn = daysOfWeek[birthDate.getDay()];

  let nextBday = new Date(currentYear, birthMonth - 1, birthDay);
  if (nextBday < now && (nextBday.getDate() !== now.getDate() || nextBday.getMonth() !== now.getMonth())) {
    nextBday = new Date(currentYear + 1, birthMonth - 1, birthDay);
  }

  let bdayMonths = nextBday.getMonth() - now.getMonth();
  let bdayDays = nextBday.getDate() - now.getDate();

  if (bdayDays < 0) {
    const prevM = nextBday.getMonth() === 0 ? 12 : nextBday.getMonth();
    const prevY = nextBday.getMonth() === 0 ? nextBday.getFullYear() - 1 : nextBday.getFullYear();
    bdayDays += getDaysInMonth(prevY, prevM);
    bdayMonths -= 1;
  }
  if (bdayMonths < 0) {
    bdayMonths += 12;
  }

  const isTodayBirthday = (currentMonth === birthMonth && currentDay === birthDay);

  return {
    years,
    months,
    days,
    totalMonths,
    totalWeeks,
    totalDays,
    dayBorn,
    isTodayBirthday,
    nextBirthday: {
      months: bdayMonths,
      days: bdayDays
    },
    formattedDob: `${birthDay.toString().padStart(2, "0")}/${birthMonth.toString().padStart(2, "0")}/${birthYear}`
  };
}

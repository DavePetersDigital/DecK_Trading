#property strict
#property indicator_chart_window
#property indicator_plots 0

enum ClockFormat
  {
   FORMAT_24_HOUR = 0,
   FORMAT_12_HOUR = 1
  };

enum DisplayDensity
  {
   DISPLAY_NORMAL = 0,
   DISPLAY_COMPACT = 1
  };

input string General_Settings = "===== GENERAL =====";
input ClockFormat InpClockFormat = FORMAT_24_HOUR;
input DisplayDensity InpDisplayDensity = DISPLAY_NORMAL;
input bool InpShowSeconds = true;
input bool InpShowDate = false;
input bool InpShowLocal = true;
input bool InpShowBroker = true;
input bool InpShowTokyo = true;
input bool InpShowLondon = true;
input bool InpShowNewYork = true;
input bool InpShowSessionCountdowns = true;
input bool InpShowProgressBars = true;
input bool InpShowCurrentChartCountdown = true;
input bool InpShowM15Countdown = true;
input bool InpShowH1Countdown = true;
input bool InpShowOverlapCountdown = true;

input string Layout_Settings = "===== LAYOUT =====";
input ENUM_BASE_CORNER InpCorner = CORNER_RIGHT_UPPER;
input int InpX = 12;
input int InpY = 18;
input int InpFontSize = 10;
input string InpFontName = "Arial";
input int InpRowHeight = 22;
input int InpLabelColumnWidth = 95;
input int InpTimeColumnWidth = 105;
input int InpStatusColumnWidth = 275;
input int InpProgressColumnWidth = 150;

input string Colour_Settings = "===== COLOURS =====";
input color InpHeadingColor = clrBlack;
input color InpLocalBrokerColor = clrBlack;
input color InpSessionOpenColor = clrForestGreen;
input color InpSessionClosedColor = clrDimGray;
input color InpSessionOpeningColor = clrDarkOrange;
input color InpSessionClosingColor = clrRed;
input color InpCandleCountdownColor = clrDarkOrange;
input color InpCandleAlertColor = clrRed;
input color InpOverlapColor = clrDarkViolet;

input string Alert_Settings = "===== ALERT WINDOWS =====";
input int InpOpeningSoonMinutes = 30;
input int InpClosingSoonMinutes = 30;
input int InpCandleAlertSeconds = 60;

input string Tokyo_Settings = "===== TOKYO LOCAL TIME =====";
input int InpTokyoOpenHour = 9;
input int InpTokyoOpenMinute = 0;
input int InpTokyoCloseHour = 15;
input int InpTokyoCloseMinute = 0;

input string London_Settings = "===== LONDON LOCAL TIME =====";
input int InpLondonOpenHour = 8;
input int InpLondonOpenMinute = 0;
input int InpLondonCloseHour = 17;
input int InpLondonCloseMinute = 0;

input string NewYork_Settings = "===== NEW YORK LOCAL TIME =====";
input int InpNewYorkOpenHour = 9;
input int InpNewYorkOpenMinute = 30;
input int InpNewYorkCloseHour = 17;
input int InpNewYorkCloseMinute = 0;

string PREFIX;

//+------------------------------------------------------------------+
int OnInit()
  {
   IndicatorShortName("DP Market Clocks");
   PREFIX = "DP_CLOCK_V300_" + IntegerToString((int)ChartID()) + "_";
   EventSetTimer(1);
   UpdateClock();
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   DeleteClockObjects();
  }

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
  {
   UpdateClock();
   return(rates_total);
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   UpdateClock();
  }

//+------------------------------------------------------------------+
void UpdateClock()
  {
   DeleteClockObjects();

   datetime utcNow = TimeGMT();
   datetime localNow = TimeLocal();
   datetime brokerNow = TimeCurrent();
   datetime tokyoNow = utcNow + 9 * 3600;
   datetime londonNow = utcNow + LondonUtcOffsetSeconds(utcNow);
   datetime newYorkNow = utcNow + NewYorkUtcOffsetSeconds(utcNow);

   int row = 0;

   DrawSingleTextRow(row++, "MARKET CLOCKS", InpHeadingColor, true);

   if(InpShowLocal)
      DrawClockRow(row++, "Local", localNow, InpLocalBrokerColor);

   if(InpShowBroker)
      DrawClockRow(row++, "Broker", brokerNow, InpLocalBrokerColor);

   if(InpShowTokyo)
      DrawSessionRow(row++, "Tokyo", tokyoNow,
                     InpTokyoOpenHour, InpTokyoOpenMinute,
                     InpTokyoCloseHour, InpTokyoCloseMinute);

   if(InpShowLondon)
      DrawSessionRow(row++, "London", londonNow,
                     InpLondonOpenHour, InpLondonOpenMinute,
                     InpLondonCloseHour, InpLondonCloseMinute);

   if(InpShowNewYork)
      DrawSessionRow(row++, "New York", newYorkNow,
                     InpNewYorkOpenHour, InpNewYorkOpenMinute,
                     InpNewYorkCloseHour, InpNewYorkCloseMinute);

   if(InpShowCurrentChartCountdown)
      DrawCandleRow(row++, TimeframeLabel((ENUM_TIMEFRAMES)Period()),
                    (ENUM_TIMEFRAMES)Period(), brokerNow);

   if(InpShowM15Countdown && Period() != PERIOD_M15)
      DrawCandleRow(row++, "M15", PERIOD_M15, brokerNow);

   if(InpShowH1Countdown && Period() != PERIOD_H1)
      DrawCandleRow(row++, "H1", PERIOD_H1, brokerNow);

   if(InpShowOverlapCountdown)
      DrawOverlapRow(row++, utcNow, londonNow, newYorkNow);

   ChartRedraw(0);
  }

//+------------------------------------------------------------------+
void DrawClockRow(int row, string label, datetime value, color clr)
  {
   if(InpDisplayDensity == DISPLAY_COMPACT)
     {
      DrawSingleTextRow(row, label + "  " + FormatClock(value), clr, false);
      return;
     }

   DrawCell(row, 0, label, clr, false);
   DrawCell(row, 1, FormatClock(value), clr, false);
  }

//+------------------------------------------------------------------+
void DrawSessionRow(int row,
                    string label,
                    datetime cityTime,
                    int openHour,
                    int openMinute,
                    int closeHour,
                    int closeMinute)
  {
   int state = 0;
   int secondsToBoundary = 0;
   double progress = 0.0;

   CalculateSessionState(cityTime,
                         openHour, openMinute,
                         closeHour, closeMinute,
                         state, secondsToBoundary, progress);

   color clr = InpSessionClosedColor;
   string stateText = "CLOSED";
   string boundaryText = "opens in " + FormatDuration(secondsToBoundary);

   if(state == 1)
     {
      clr = InpSessionOpeningColor;
      stateText = "OPENING SOON";
      boundaryText = "opens in " + FormatDuration(secondsToBoundary);
     }
   else if(state == 2)
     {
      clr = InpSessionOpenColor;
      stateText = "OPEN";
      boundaryText = "closes in " + FormatDuration(secondsToBoundary);
     }
   else if(state == 3)
     {
      clr = InpSessionClosingColor;
      stateText = "CLOSING";
      boundaryText = "closes in " + FormatDuration(secondsToBoundary);
     }

   string status = stateText;
   if(InpShowSessionCountdowns)
      status += " (" + boundaryText + ")";

   string progressText = "";
   if(InpShowProgressBars && state >= 2)
      progressText = BuildProgressBar(progress) + " " +
                     DoubleToString(progress * 100.0, 0) + "%";

   if(InpDisplayDensity == DISPLAY_COMPACT)
     {
      string compact = label + "  " + FormatClock(cityTime) + "  " + status;
      if(progressText != "")
         compact += "  " + progressText;

      DrawSingleTextRow(row, compact, clr, false);
      return;
     }

   DrawCell(row, 0, label, clr, false);
   DrawCell(row, 1, FormatClock(cityTime), clr, false);
   DrawCell(row, 2, status, clr, false);

   if(progressText != "")
      DrawCell(row, 3, progressText, clr, false);
  }

//+------------------------------------------------------------------+
void DrawCandleRow(int row,
                   string timeframeText,
                   ENUM_TIMEFRAMES timeframe,
                   datetime brokerNow)
  {
   int secondsLeft = CandleSecondsRemaining(timeframe, brokerNow);
   color clr = (secondsLeft <= MathMax(InpCandleAlertSeconds, 0))
               ? InpCandleAlertColor
               : InpCandleCountdownColor;

   DrawSingleTextRow(row,
                     timeframeText + " candle closes in " +
                     FormatDuration(secondsLeft),
                     clr,
                     false);
  }

//+------------------------------------------------------------------+
void DrawOverlapRow(int row,
                    datetime utcNow,
                    datetime londonNow,
                    datetime newYorkNow)
  {
   int londonState = 0;
   int londonSeconds = 0;
   double londonProgress = 0.0;

   CalculateSessionState(londonNow,
                         InpLondonOpenHour, InpLondonOpenMinute,
                         InpLondonCloseHour, InpLondonCloseMinute,
                         londonState, londonSeconds, londonProgress);

   int newYorkState = 0;
   int newYorkSeconds = 0;
   double newYorkProgress = 0.0;

   CalculateSessionState(newYorkNow,
                         InpNewYorkOpenHour, InpNewYorkOpenMinute,
                         InpNewYorkCloseHour, InpNewYorkCloseMinute,
                         newYorkState, newYorkSeconds, newYorkProgress);

   bool londonOpen = (londonState == 2 || londonState == 3);
   bool newYorkOpen = (newYorkState == 2 || newYorkState == 3);

   string text;

   if(londonOpen && newYorkOpen)
     {
      int remaining = MathMin(londonSeconds, newYorkSeconds);
      text = "London / New York overlap active (ends in " +
             FormatDuration(remaining) + ")";
     }
   else
     {
      int untilOverlap = SecondsUntilNextOverlap(utcNow);
      text = "London / New York overlap begins in " +
             FormatDuration(untilOverlap);
     }

   DrawSingleTextRow(row, text, InpOverlapColor, false);
  }

//+------------------------------------------------------------------+
void DrawSingleTextRow(int row, string text, color clr, bool bold)
  {
   DrawLabel(PREFIX + "ROW_" + IntegerToString(row) + "_TEXT",
             row,
             0,
             text,
             clr,
             bold);
  }

//+------------------------------------------------------------------+
void DrawCell(int row,
              int column,
              string text,
              color clr,
              bool bold)
  {
   DrawLabel(PREFIX + "ROW_" + IntegerToString(row) +
             "_COL_" + IntegerToString(column),
             row,
             ColumnOffset(column),
             text,
             clr,
             bold);
  }

//+------------------------------------------------------------------+
int ColumnOffset(int column)
  {
   if(column <= 0)
      return(0);

   if(column == 1)
      return(InpLabelColumnWidth);

   if(column == 2)
      return(InpLabelColumnWidth + InpTimeColumnWidth);

   return(InpLabelColumnWidth +
          InpTimeColumnWidth +
          InpStatusColumnWidth);
  }

//+------------------------------------------------------------------+
int TotalBlockWidth()
  {
   return(InpLabelColumnWidth +
          InpTimeColumnWidth +
          InpStatusColumnWidth +
          InpProgressColumnWidth);
  }

//+------------------------------------------------------------------+
void DrawLabel(string name,
               int row,
               int xOffset,
               string text,
               color clr,
               bool bold)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);

   ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);

   bool rightSide = (InpCorner == CORNER_RIGHT_UPPER ||
                     InpCorner == CORNER_RIGHT_LOWER);

   ENUM_ANCHOR_POINT anchor = ANCHOR_LEFT_UPPER;

   if(InpCorner == CORNER_LEFT_LOWER ||
      InpCorner == CORNER_RIGHT_LOWER)
      anchor = ANCHOR_LEFT_LOWER;

   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);

   int x = rightSide
           ? InpX + TotalBlockWidth() - xOffset
           : InpX + xOffset;

   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE,
                    InpY + row * MathMax(InpRowHeight, InpFontSize + 6));
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, InpFontSize);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetString(0, name, OBJPROP_FONT,
                   bold ? "Arial Bold" : InpFontName);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
  }

//+------------------------------------------------------------------+
void CalculateSessionState(datetime cityTime,
                           int openHour,
                           int openMinute,
                           int closeHour,
                           int closeMinute,
                           int &state,
                           int &secondsToBoundary,
                           double &progress)
  {
   MqlDateTime dt;
   TimeToStruct(cityTime, dt);

   int nowSeconds = dt.hour * 3600 + dt.min * 60 + dt.sec;
   int openSeconds = openHour * 3600 + openMinute * 60;
   int closeSeconds = closeHour * 3600 + closeMinute * 60;

   state = 0;
   secondsToBoundary = 0;
   progress = 0.0;

   if(dt.day_of_week == 0 || dt.day_of_week == 6)
     {
      secondsToBoundary = SecondsUntilNextWeekdayOpen(dt, openSeconds);
      return;
     }

   bool isOpen = false;
   int sessionLength = 0;
   int elapsed = 0;

   if(openSeconds < closeSeconds)
     {
      isOpen = (nowSeconds >= openSeconds &&
                nowSeconds < closeSeconds);

      if(isOpen)
        {
         sessionLength = closeSeconds - openSeconds;
         elapsed = nowSeconds - openSeconds;
         secondsToBoundary = closeSeconds - nowSeconds;
        }
      else if(nowSeconds < openSeconds)
         secondsToBoundary = openSeconds - nowSeconds;
      else
         secondsToBoundary = 86400 - nowSeconds + openSeconds;
     }
   else
     {
      isOpen = (nowSeconds >= openSeconds ||
                nowSeconds < closeSeconds);

      if(isOpen)
        {
         sessionLength = (86400 - openSeconds) + closeSeconds;

         if(nowSeconds >= openSeconds)
           {
            elapsed = nowSeconds - openSeconds;
            secondsToBoundary = 86400 - nowSeconds + closeSeconds;
           }
         else
           {
            elapsed = 86400 - openSeconds + nowSeconds;
            secondsToBoundary = closeSeconds - nowSeconds;
           }
        }
      else
         secondsToBoundary = openSeconds - nowSeconds;
     }

   if(isOpen)
     {
      progress = (sessionLength > 0)
                 ? MathMin(MathMax((double)elapsed /
                                   (double)sessionLength, 0.0), 1.0)
                 : 0.0;

      if(InpClosingSoonMinutes > 0 &&
         secondsToBoundary <= InpClosingSoonMinutes * 60)
         state = 3;
      else
         state = 2;
     }
   else
     {
      if(InpOpeningSoonMinutes > 0 &&
         secondsToBoundary <= InpOpeningSoonMinutes * 60)
         state = 1;
      else
         state = 0;
     }
  }

//+------------------------------------------------------------------+
int SecondsUntilNextWeekdayOpen(MqlDateTime &current,
                                int openSeconds)
  {
   int nowSeconds = current.hour * 3600 +
                    current.min * 60 +
                    current.sec;

   int daysAhead = 1;

   if(current.day_of_week == 6)
      daysAhead = 2;
   else if(current.day_of_week == 0)
      daysAhead = 1;

   return(daysAhead * 86400 - nowSeconds + openSeconds);
  }

//+------------------------------------------------------------------+
int SecondsUntilNextOverlap(datetime utcNow)
  {
   for(int dayOffset = 0; dayOffset <= 7; dayOffset++)
     {
      datetime candidateUtc = utcNow + dayOffset * 86400;

      MqlDateTime candidate;
      TimeToStruct(candidateUtc, candidate);

      if(candidate.day_of_week == 0 ||
         candidate.day_of_week == 6)
         continue;

      int londonOffset = LondonUtcOffsetSeconds(candidateUtc);
      int newYorkOffset = NewYorkUtcOffsetSeconds(candidateUtc);

      datetime londonOpenUtc =
         CityLocalToUtc(candidate.year, candidate.mon, candidate.day,
                        InpLondonOpenHour, InpLondonOpenMinute,
                        londonOffset);

      datetime newYorkOpenUtc =
         CityLocalToUtc(candidate.year, candidate.mon, candidate.day,
                        InpNewYorkOpenHour, InpNewYorkOpenMinute,
                        newYorkOffset);

      datetime overlapStart = MathMax(londonOpenUtc,
                                      newYorkOpenUtc);

      if(overlapStart > utcNow)
         return((int)(overlapStart - utcNow));
     }

   return(0);
  }

//+------------------------------------------------------------------+
datetime CityLocalToUtc(int year,
                        int month,
                        int day,
                        int hour,
                        int minute,
                        int utcOffsetSeconds)
  {
   MqlDateTime parts;
   ZeroMemory(parts);

   parts.year = year;
   parts.mon = month;
   parts.day = day;
   parts.hour = hour;
   parts.min = minute;
   parts.sec = 0;

   return(StructToTime(parts) - utcOffsetSeconds);
  }

//+------------------------------------------------------------------+
string BuildProgressBar(double progress)
  {
   int blocks = 10;
   int filled = (int)MathRound(progress * blocks);

   if(filled < 0)
      filled = 0;
   if(filled > blocks)
      filled = blocks;

   string result = "[";

   for(int i = 0; i < blocks; i++)
      result += (i < filled ? "|" : ".");

   result += "]";
   return(result);
  }

//+------------------------------------------------------------------+
string FormatClock(datetime value)
  {
   MqlDateTime dt;
   TimeToStruct(value, dt);

   string dateText = "";

   if(InpShowDate)
      dateText = StringFormat("%04d-%02d-%02d ",
                              dt.year, dt.mon, dt.day);

   if(InpClockFormat == FORMAT_24_HOUR)
     {
      if(InpShowSeconds)
         return(dateText +
                StringFormat("%02d:%02d:%02d",
                             dt.hour, dt.min, dt.sec));

      return(dateText +
             StringFormat("%02d:%02d",
                          dt.hour, dt.min));
     }

   int hour12 = dt.hour % 12;
   if(hour12 == 0)
      hour12 = 12;

   string ampm = (dt.hour < 12 ? "AM" : "PM");

   if(InpShowSeconds)
      return(dateText +
             StringFormat("%02d:%02d:%02d %s",
                          hour12, dt.min, dt.sec, ampm));

   return(dateText +
          StringFormat("%02d:%02d %s",
                       hour12, dt.min, ampm));
  }

//+------------------------------------------------------------------+
int CandleSecondsRemaining(ENUM_TIMEFRAMES timeframe,
                           datetime brokerNow)
  {
   int timeframeSeconds = PeriodSeconds(timeframe);

   if(timeframeSeconds <= 0)
      return(0);

   datetime barOpen = iTime(Symbol(), timeframe, 0);

   if(barOpen <= 0)
      return(0);

   int remaining = (int)(barOpen +
                         timeframeSeconds -
                         brokerNow);

   if(remaining < 0)
      remaining = 0;

   if(remaining > timeframeSeconds)
      remaining = timeframeSeconds;

   return(remaining);
  }

//+------------------------------------------------------------------+
string FormatDuration(int totalSeconds)
  {
   if(totalSeconds < 0)
      totalSeconds = 0;

   int hours = totalSeconds / 3600;
   int minutes = (totalSeconds % 3600) / 60;
   int seconds = totalSeconds % 60;

   return(StringFormat("%02d:%02d:%02d",
                       hours, minutes, seconds));
  }

//+------------------------------------------------------------------+
string TimeframeLabel(ENUM_TIMEFRAMES timeframe)
  {
   if(timeframe == PERIOD_M1) return("M1");
   if(timeframe == PERIOD_M5) return("M5");
   if(timeframe == PERIOD_M15) return("M15");
   if(timeframe == PERIOD_M30) return("M30");
   if(timeframe == PERIOD_H1) return("H1");
   if(timeframe == PERIOD_H4) return("H4");
   if(timeframe == PERIOD_D1) return("D1");
   if(timeframe == PERIOD_W1) return("W1");
   if(timeframe == PERIOD_MN1) return("MN1");

   return(IntegerToString((int)timeframe));
  }

//+------------------------------------------------------------------+
int LondonUtcOffsetSeconds(datetime utc)
  {
   MqlDateTime dt;
   TimeToStruct(utc, dt);

   datetime dstStart = LastSundayUtc(dt.year, 3, 1);
   datetime dstEnd = LastSundayUtc(dt.year, 10, 1);

   return((utc >= dstStart && utc < dstEnd)
          ? 3600
          : 0);
  }

//+------------------------------------------------------------------+
int NewYorkUtcOffsetSeconds(datetime utc)
  {
   MqlDateTime dt;
   TimeToStruct(utc, dt);

   datetime dstStart = NthSundayUtc(dt.year, 3, 2, 7);
   datetime dstEnd = NthSundayUtc(dt.year, 11, 1, 6);

   return((utc >= dstStart && utc < dstEnd)
          ? -4 * 3600
          : -5 * 3600);
  }

//+------------------------------------------------------------------+
datetime LastSundayUtc(int year,
                       int month,
                       int hour)
  {
   int nextMonth = month + 1;
   int nextYear = year;

   if(nextMonth == 13)
     {
      nextMonth = 1;
      nextYear++;
     }

   MqlDateTime dt;
   ZeroMemory(dt);

   dt.year = nextYear;
   dt.mon = nextMonth;
   dt.day = 1;

   datetime firstNextMonth = StructToTime(dt);
   datetime lastDay = firstNextMonth - 86400;

   MqlDateTime last;
   TimeToStruct(lastDay, last);

   return(lastDay -
          last.day_of_week * 86400 +
          hour * 3600);
  }

//+------------------------------------------------------------------+
datetime NthSundayUtc(int year,
                      int month,
                      int nth,
                      int hour)
  {
   MqlDateTime dt;
   ZeroMemory(dt);

   dt.year = year;
   dt.mon = month;
   dt.day = 1;

   datetime firstDay = StructToTime(dt);

   MqlDateTime first;
   TimeToStruct(firstDay, first);

   int daysToSunday =
      (7 - first.day_of_week) % 7;

   return(firstDay +
          daysToSunday * 86400 +
          (nth - 1) * 7 * 86400 +
          hour * 3600);
  }

//+------------------------------------------------------------------+
void DeleteClockObjects()
  {
   int total = ObjectsTotal(0, 0, -1);

   for(int i = total - 1; i >= 0; i--)
     {
      string name = ObjectName(0, i, 0, -1);

      if(StringFind(name, PREFIX) == 0)
         ObjectDelete(0, name);
     }
  }
//+------------------------------------------------------------------+

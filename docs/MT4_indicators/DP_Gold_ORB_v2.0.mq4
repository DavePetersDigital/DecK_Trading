#property strict
#property indicator_chart_window
#property indicator_plots 0

// DP Gold ORB v1.0
// Gold-specific opening range and session manipulation dashboard.

enum GoldOrbClass
  {
   GOLD_NORMAL = 0,
   GOLD_ELEVATED = 1,
   GOLD_LARGE = 2,
   GOLD_EXTREME = 3
  };

input string General_Settings = "===== GENERAL =====";
input bool Show_Tokyo = true;
input bool Show_London = true;
input bool Show_New_York = true;
input int Daily_ATR_Period = 14;
input int Historical_Sessions_To_Analyse = 20;
input int Minimum_Historical_Sessions = 10;

input string Gold_Classification = "===== GOLD CLASSIFICATION =====";
input double Elevated_Percentile = 60.0;
input double Large_Percentile = 80.0;
input double Extreme_Percentile = 95.0;
input color Normal_Colour = clrSilver;
input color Elevated_Colour = clrKhaki;
input color Large_Colour = clrOrange;
input color Extreme_Colour = clrTomato;
input color Bull_Colour = clrLimeGreen;
input color Bear_Colour = clrTomato;
input color Reclaimed_Colour = clrLimeGreen;
input color Waiting_Colour = clrDarkGray;

input string Session_Settings = "===== SESSION LOCAL TIMES =====";
input int Tokyo_Open_Hour = 9;
input int Tokyo_Open_Minute = 0;
input int Tokyo_Close_Hour = 15;
input int Tokyo_Close_Minute = 0;
input int Tokyo_Trading_Window_Minutes = 120;

input int London_Open_Hour = 8;
input int London_Open_Minute = 0;
input int London_Close_Hour = 17;
input int London_Close_Minute = 0;
input int London_Trading_Window_Minutes = 120;

input int New_York_Open_Hour = 9;
input int New_York_Open_Minute = 30;
input int New_York_Close_Hour = 17;
input int New_York_Close_Minute = 0;
input int New_York_Trading_Window_Minutes = 120;

input string Box_Display_Settings = "===== ORB BOX DISPLAY =====";
input bool Show_Trading_Window_Box = true;
input bool Show_Full_Session_Box = false;
input bool Keep_Trading_Box_After_Window = false;
input bool Fill_Trading_Window_Box = true;
input bool Fill_Full_Session_Box = false;
input bool Draw_Full_Session_Box_Behind = true;
input bool Draw_Trading_Window_Box_Behind = true;
input ENUM_LINE_STYLE Trading_Box_Line_Style = STYLE_SOLID;
input ENUM_LINE_STYLE Full_Session_Box_Line_Style = STYLE_DASH;
input int Trading_Box_Line_Width = 1;
input int Full_Session_Box_Line_Width = 1;
input color Tokyo_Trading_Box_Colour = clrMoccasin;
input color Tokyo_Full_Session_Box_Colour = clrDarkOrange;
input color London_Trading_Box_Colour = clrLightBlue;
input color London_Full_Session_Box_Colour = clrRoyalBlue;
input color New_York_Trading_Box_Colour = clrLavender;
input color New_York_Full_Session_Box_Colour = clrPurple;

input string Table_Settings = "===== TEXT TABLE (NO PANEL) =====";
input bool Show_Table = true;
input ENUM_BASE_CORNER Table_Corner = CORNER_LEFT_UPPER;
input int Table_X = 10;
input int Table_Y = 20;
input int Table_Font_Size = 9;
input int Table_Row_Height = 18;
input color Table_Title_Colour = clrWhite;
input color Table_Header_Colour = clrSilver;
input color Table_Text_Colour = clrWhite;
input string Table_Font = "Consolas";

string PREFIX = "DP_GOLD_ORB_";
bool g_chartDirty = false;

struct SessionRow
  {
   bool enabled;
   bool openingReady;
   bool sessionClosed;
   string name;
   string direction;
   string rangeText;
   string atrText;
   string atrPercentText;
   string rankText;
   string classText;
   string setupText;
   color directionColour;
   color classColour;
   color setupColour;
  };

SessionRow g_rows[3];

int OnInit()
  {
   IndicatorShortName("DP Gold ORB v1.0");
   EventSetTimer(1);
   UpdateAll();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   DeleteAllIndicatorObjects();
  }

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
   if(prev_calculated == 0)
      UpdateAll();
   return(rates_total);
  }

void OnTimer()
  {
   UpdateAll();
  }

void UpdateAll()
  {
   datetime utcNow = TimeGMT();
   int brokerOffset = (int)(TimeCurrent() - utcNow);
   double dailyATR = iATR(Symbol(), PERIOD_D1, MathMax(Daily_ATR_Period, 1), 1);

   InitialiseRow(0, "Tokyo", Show_Tokyo, dailyATR);
   InitialiseRow(1, "London", Show_London, dailyATR);
   InitialiseRow(2, "New York", Show_New_York, dailyATR);

   if(Show_Tokyo)
      ProcessSession(0, utcNow, 9 * 3600, brokerOffset,
                     Tokyo_Open_Hour, Tokyo_Open_Minute,
                     Tokyo_Close_Hour, Tokyo_Close_Minute,
                     Tokyo_Trading_Window_Minutes, dailyATR,
                     Tokyo_Trading_Box_Colour, Tokyo_Full_Session_Box_Colour);
   else
      DeleteSessionBoxes(0);

   if(Show_London)
      ProcessSession(1, utcNow, LondonUtcOffsetSeconds(utcNow), brokerOffset,
                     London_Open_Hour, London_Open_Minute,
                     London_Close_Hour, London_Close_Minute,
                     London_Trading_Window_Minutes, dailyATR,
                     London_Trading_Box_Colour, London_Full_Session_Box_Colour);
   else
      DeleteSessionBoxes(1);

   if(Show_New_York)
      ProcessSession(2, utcNow, NewYorkUtcOffsetSeconds(utcNow), brokerOffset,
                     New_York_Open_Hour, New_York_Open_Minute,
                     New_York_Close_Hour, New_York_Close_Minute,
                     New_York_Trading_Window_Minutes, dailyATR,
                     New_York_Trading_Box_Colour, New_York_Full_Session_Box_Colour);
   else
      DeleteSessionBoxes(2);

   if(Show_Table)
      DrawCombinedTable();
   else
      DeleteTableObjects();

   if(g_chartDirty)
     {
      ChartRedraw(0);
      g_chartDirty = false;
     }
  }

void InitialiseRow(int id, string name, bool enabled, double dailyATR)
  {
   g_rows[id].enabled = enabled;
   g_rows[id].openingReady = false;
   g_rows[id].sessionClosed = false;
   g_rows[id].name = name;
   g_rows[id].direction = "---";
   g_rows[id].rangeText = "---";
   g_rows[id].atrText = (dailyATR > 0.0 ? MoneyText(dailyATR) : "---");
   g_rows[id].atrPercentText = "---";
   g_rows[id].rankText = "---";
   g_rows[id].classText = enabled ? "WAITING" : "HIDDEN";
   g_rows[id].setupText = "---";
   g_rows[id].directionColour = Table_Text_Colour;
   g_rows[id].classColour = Waiting_Colour;
   g_rows[id].setupColour = Waiting_Colour;
  }

void ProcessSession(int sessionId,
                    datetime utcNow,
                    int cityUtcOffset,
                    int brokerUtcOffset,
                    int openHour,
                    int openMinute,
                    int closeHour,
                    int closeMinute,
                    int tradingWindowMinutes,
                    double dailyATR,
                    color tradingBoxColour,
                    color fullSessionBoxColour)
  {
   datetime cityNow = utcNow + cityUtcOffset;
   MqlDateTime cityDate;
   TimeToStruct(cityNow, cityDate);

   datetime openUtc = CityLocalToUtc(cityDate.year, cityDate.mon, cityDate.day,
                                     openHour, openMinute, cityUtcOffset);
   datetime closeUtc = CityLocalToUtc(cityDate.year, cityDate.mon, cityDate.day,
                                      closeHour, closeMinute, cityUtcOffset);
   if(closeUtc <= openUtc)
      closeUtc += 86400;

   datetime openBroker = openUtc + brokerUtcOffset;
   datetime openingCandleClose = openBroker + 15 * 60;
   datetime tradingWindowEnd = openBroker + MathMax(tradingWindowMinutes, 15) * 60;
   datetime sessionClose = closeUtc + brokerUtcOffset;
   datetime now = TimeCurrent();

   if(now < openBroker)
     {
      g_rows[sessionId].setupText = "Opens " + TimeText(openHour, openMinute);
      g_rows[sessionId].setupColour = Waiting_Colour;
      DeleteSessionBoxes(sessionId);
      return;
     }

   if(now < openingCandleClose)
     {
      int secondsRemaining = (int)(openingCandleClose - now);
      g_rows[sessionId].classText = "FORMING";
      g_rows[sessionId].setupText = "Closes " + FormatMinutesSeconds(secondsRemaining);
      g_rows[sessionId].classColour = Elevated_Colour;
      g_rows[sessionId].setupColour = Elevated_Colour;
      DeleteSessionBoxes(sessionId);
      return;
     }

   int shift = iBarShift(Symbol(), PERIOD_M15, openBroker, true);
   if(shift < 0)
      shift = iBarShift(Symbol(), PERIOD_M15, openBroker, false);

   if(shift < 0)
     {
      g_rows[sessionId].classText = "NO DATA";
      g_rows[sessionId].setupText = "History missing";
      return;
     }

   datetime actualBarTime = iTime(Symbol(), PERIOD_M15, shift);
   if(MathAbs((double)(actualBarTime - openBroker)) > 60.0)
     {
      g_rows[sessionId].classText = "NO DATA";
      g_rows[sessionId].setupText = "History missing";
      return;
     }

   double barOpen = iOpen(Symbol(), PERIOD_M15, shift);
   double barHigh = iHigh(Symbol(), PERIOD_M15, shift);
   double barLow = iLow(Symbol(), PERIOD_M15, shift);
   double barClose = iClose(Symbol(), PERIOD_M15, shift);
   if(barHigh <= barLow)
      return;

   g_rows[sessionId].openingReady = true;
   g_rows[sessionId].sessionClosed = (now >= sessionClose);

   double openingRange = barHigh - barLow;
   double atrPercent = (dailyATR > 0.0 ? (openingRange / dailyATR) * 100.0 : 0.0);
   bool bullish = (barClose > barOpen);
   bool bearish = (barClose < barOpen);

   g_rows[sessionId].direction = bullish ? "Bull" : (bearish ? "Bear" : "Doji");
   g_rows[sessionId].directionColour = bullish ? Bull_Colour : (bearish ? Bear_Colour : Table_Text_Colour);
   g_rows[sessionId].rangeText = MoneyText(openingRange);
   g_rows[sessionId].atrPercentText = (dailyATR > 0.0 ? DoubleToString(atrPercent, 1) + "%" : "---");

   int sampleCount = 0;
   double rank = CalculateHistoricalRank(sessionId, cityDate, openHour, openMinute,
                                         brokerUtcOffset, openingRange, sampleCount);

   if(sampleCount >= MathMax(Minimum_Historical_Sessions, 1))
     {
      g_rows[sessionId].rankText = DoubleToString(rank, 0) + "%";
      GoldOrbClass orbClass = ClassifyRank(rank);
      SetClassText(orbClass, g_rows[sessionId].classText, g_rows[sessionId].classColour);
     }
   else
     {
      g_rows[sessionId].rankText = "n=" + IntegerToString(sampleCount);
      g_rows[sessionId].classText = "INSUFFICIENT";
      g_rows[sessionId].classColour = Waiting_Colour;
     }

   g_rows[sessionId].setupText = DetectSetup(openBroker, tradingWindowEnd,
                                             barHigh, barLow, bullish, bearish);
   g_rows[sessionId].setupColour = SetupColour(g_rows[sessionId].setupText);

   string base = PREFIX + IntegerToString(sessionId) + "_";
   if(Show_Full_Session_Box && now < sessionClose)
      CreateOrUpdateRectangle(base + "FULL_BOX", openBroker, barHigh,
                              sessionClose, barLow, fullSessionBoxColour,
                              Full_Session_Box_Line_Style,
                              Full_Session_Box_Line_Width,
                              Fill_Full_Session_Box,
                              Draw_Full_Session_Box_Behind);
   else
      DeleteObject(base + "FULL_BOX");

   bool tradingWindowActive = (now < tradingWindowEnd);
   bool showTradingBoxNow = Show_Trading_Window_Box &&
                            now < sessionClose &&
                            (tradingWindowActive || Keep_Trading_Box_After_Window);

   if(showTradingBoxNow)
      CreateOrUpdateRectangle(base + "TRADING_BOX", openBroker, barHigh,
                              tradingWindowEnd, barLow, tradingBoxColour,
                              Trading_Box_Line_Style,
                              Trading_Box_Line_Width,
                              Fill_Trading_Window_Box,
                              Draw_Trading_Window_Box_Behind);
   else
      DeleteObject(base + "TRADING_BOX");
  }

// Percentile rank of today's opening range against prior valid openings
// from the same session. Weekends and missing bars are skipped.
double CalculateHistoricalRank(int sessionId,
                               MqlDateTime &currentCityDate,
                               int openHour,
                               int openMinute,
                               int brokerUtcOffset,
                               double currentRange,
                               int &sampleCount)
  {
   sampleCount = 0;
   int target = MathMax(Historical_Sessions_To_Analyse, 1);
   int lessOrEqual = 0;

   MqlDateTime dateOnly = currentCityDate;
   dateOnly.hour = 12;
   dateOnly.min = 0;
   dateOnly.sec = 0;
   datetime cursor = StructToTime(dateOnly) - 86400;

   int attempts = 0;
   int maxAttempts = target * 4 + 20;

   while(sampleCount < target && attempts < maxAttempts)
     {
      attempts++;
      MqlDateTime d;
      TimeToStruct(cursor, d);

      if(d.day_of_week != 0 && d.day_of_week != 6)
        {
         int cityOffset = HistoricalCityOffset(sessionId, d.year, d.mon, d.day);
         datetime openUtc = CityLocalToUtc(d.year, d.mon, d.day,
                                           openHour, openMinute, cityOffset);
         datetime openBroker = openUtc + brokerUtcOffset;
         int shift = iBarShift(Symbol(), PERIOD_M15, openBroker, true);
         if(shift < 0)
            shift = iBarShift(Symbol(), PERIOD_M15, openBroker, false);

         if(shift >= 0)
           {
            datetime barTime = iTime(Symbol(), PERIOD_M15, shift);
            if(MathAbs((double)(barTime - openBroker)) <= 60.0)
              {
               double h = iHigh(Symbol(), PERIOD_M15, shift);
               double l = iLow(Symbol(), PERIOD_M15, shift);
               if(h > l)
                 {
                  double r = h - l;
                  if(r <= currentRange)
                     lessOrEqual++;
                  sampleCount++;
                 }
              }
           }
        }

      cursor -= 86400;
     }

   if(sampleCount <= 0)
      return(0.0);

   return(100.0 * lessOrEqual / sampleCount);
  }

int HistoricalCityOffset(int sessionId, int year, int month, int day)
  {
   if(sessionId == 0)
      return(9 * 3600);

   MqlDateTime noon;
   ZeroMemory(noon);
   noon.year = year;
   noon.mon = month;
   noon.day = day;
   noon.hour = 12;
   datetime utcApprox = StructToTime(noon);

   if(sessionId == 1)
      return(LondonUtcOffsetSeconds(utcApprox));

   return(NewYorkUtcOffsetSeconds(utcApprox));
  }

GoldOrbClass ClassifyRank(double rank)
  {
   if(rank >= Extreme_Percentile)
      return(GOLD_EXTREME);
   if(rank >= Large_Percentile)
      return(GOLD_LARGE);
   if(rank >= Elevated_Percentile)
      return(GOLD_ELEVATED);
   return(GOLD_NORMAL);
  }

void SetClassText(GoldOrbClass orbClass, string &text, color &clr)
  {
   if(orbClass == GOLD_EXTREME)
     {
      text = "EXTREME";
      clr = Extreme_Colour;
     }
   else if(orbClass == GOLD_LARGE)
     {
      text = "LARGE";
      clr = Large_Colour;
     }
   else if(orbClass == GOLD_ELEVATED)
     {
      text = "ELEVATED";
      clr = Elevated_Colour;
     }
   else
     {
      text = "NORMAL";
      clr = Normal_Colour;
     }
  }

string DetectSetup(datetime openBroker,
                   datetime tradingWindowEnd,
                   double orbHigh,
                   double orbLow,
                   bool openingBullish,
                   bool openingBearish)
  {
   datetime now = TimeCurrent();
   datetime scanEnd = MathMin(now, tradingWindowEnd);
   int newestShift = iBarShift(Symbol(), PERIOD_M5, scanEnd, false);
   int oldestShift = iBarShift(Symbol(), PERIOD_M5, openBroker + 15 * 60, false);

   if(newestShift < 0 || oldestShift < 0)
      return("Waiting");

   bool extended = false;
   for(int shift = oldestShift; shift >= newestShift; shift--)
     {
      double h = iHigh(Symbol(), PERIOD_M5, shift);
      double l = iLow(Symbol(), PERIOD_M5, shift);
      double c = iClose(Symbol(), PERIOD_M5, shift);

      // A bearish opening candle is treated as a downside liquidity push.
      // Reclaim requires a subsequent M5 close back above the ORB low.
      if(openingBearish)
        {
         if(l < orbLow)
            extended = true;
         if(extended && c > orbLow)
            return("Reclaimed");
        }
      // A bullish opening candle is treated as an upside liquidity push.
      // Reclaim requires a subsequent M5 close back below the ORB high.
      else if(openingBullish)
        {
         if(h > orbHigh)
            extended = true;
         if(extended && c < orbHigh)
            return("Reclaimed");
        }
     }

   if(extended)
      return("Extended");
   if(now >= tradingWindowEnd)
      return("No reclaim");
   return("Waiting");
  }

color SetupColour(string setup)
  {
   if(setup == "Reclaimed")
      return(Reclaimed_Colour);
   if(setup == "Extended")
      return(Elevated_Colour);
   if(setup == "No reclaim")
      return(Normal_Colour);
   return(Waiting_Colour);
  }

void DrawCombinedTable()
  {
   string title = PREFIX + "TABLE_TITLE";
   CreateOrUpdateLabel(title, "DP Gold ORB", Table_Title_Colour,
                       Table_Font_Size + 1, true, Table_X, Table_Y);

   int yHeader = Table_Y + Table_Row_Height + 2;
   string headers[8] = {"Session", "Dir", "Range", "ATR", "ATR%", "Rank", "Class", "Setup"};
   int colX[8] = {0, 68, 112, 174, 232, 282, 326, 404};

   for(int c = 0; c < 8; c++)
      CreateOrUpdateLabel(PREFIX + "H_" + IntegerToString(c), headers[c],
                          Table_Header_Colour, Table_Font_Size, true,
                          ColumnX(colX[c]), yHeader);

   int visibleRow = 0;
   for(int s = 0; s < 3; s++)
     {
      if(!g_rows[s].enabled)
        {
         DeleteRowObjects(s);
         continue;
        }

      int y = yHeader + Table_Row_Height * (visibleRow + 1);
      CreateOrUpdateLabel(RowName(s, 0), g_rows[s].name, Table_Text_Colour,
                          Table_Font_Size, false, ColumnX(colX[0]), y);
      CreateOrUpdateLabel(RowName(s, 1), g_rows[s].direction, g_rows[s].directionColour,
                          Table_Font_Size, false, ColumnX(colX[1]), y);
      CreateOrUpdateLabel(RowName(s, 2), g_rows[s].rangeText, Table_Text_Colour,
                          Table_Font_Size, false, ColumnX(colX[2]), y);
      CreateOrUpdateLabel(RowName(s, 3), g_rows[s].atrText, Table_Text_Colour,
                          Table_Font_Size, false, ColumnX(colX[3]), y);
      CreateOrUpdateLabel(RowName(s, 4), g_rows[s].atrPercentText, Table_Text_Colour,
                          Table_Font_Size, false, ColumnX(colX[4]), y);
      CreateOrUpdateLabel(RowName(s, 5), g_rows[s].rankText, Table_Text_Colour,
                          Table_Font_Size, false, ColumnX(colX[5]), y);
      CreateOrUpdateLabel(RowName(s, 6), g_rows[s].classText, g_rows[s].classColour,
                          Table_Font_Size, false, ColumnX(colX[6]), y);
      CreateOrUpdateLabel(RowName(s, 7), g_rows[s].setupText, g_rows[s].setupColour,
                          Table_Font_Size, false, ColumnX(colX[7]), y);
      visibleRow++;
     }
  }

int ColumnX(int leftOffset)
  {
   if(!IsRightCorner())
      return(Table_X + leftOffset);

   int tableWidth = 500;
   return(Table_X + tableWidth - leftOffset);
  }

string RowName(int sessionId, int column)
  {
   return(PREFIX + "R_" + IntegerToString(sessionId) + "_" + IntegerToString(column));
  }

void CreateOrUpdateLabel(string name,
                         string text,
                         color clr,
                         int fontSize,
                         bool bold,
                         int x,
                         int y)
  {
   bool created = false;
   if(ObjectFind(0, name) < 0)
     {
      if(!ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0))
         return;
      created = true;
     }

   string wantedFont = bold ? Table_Font + " Bold" : Table_Font;
   ENUM_ANCHOR_POINT anchor;
   if(IsRightCorner())
      anchor = IsLowerCorner() ? ANCHOR_RIGHT_LOWER : ANCHOR_RIGHT_UPPER;
   else
      anchor = IsLowerCorner() ? ANCHOR_LEFT_LOWER : ANCHOR_LEFT_UPPER;

   SetIntegerIfChanged(name, OBJPROP_CORNER, Table_Corner, created);
   SetIntegerIfChanged(name, OBJPROP_ANCHOR, anchor, created);
   SetIntegerIfChanged(name, OBJPROP_XDISTANCE, x, created);
   SetIntegerIfChanged(name, OBJPROP_YDISTANCE, y, created);
   SetIntegerIfChanged(name, OBJPROP_COLOR, clr, created);
   SetIntegerIfChanged(name, OBJPROP_FONTSIZE, fontSize, created);

   if(created || ObjectGetString(0, name, OBJPROP_FONT) != wantedFont)
     {
      ObjectSetString(0, name, OBJPROP_FONT, wantedFont);
      g_chartDirty = true;
     }
   if(created || ObjectGetString(0, name, OBJPROP_TEXT) != text)
     {
      ObjectSetString(0, name, OBJPROP_TEXT, text);
      g_chartDirty = true;
     }

   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

void SetIntegerIfChanged(string name, int property, long value, bool created)
  {
   if(created || ObjectGetInteger(0, name, property) != value)
     {
      ObjectSetInteger(0, name, property, value);
      g_chartDirty = true;
     }
  }

void CreateOrUpdateRectangle(string name,
                             datetime time1,
                             double price1,
                             datetime time2,
                             double price2,
                             color boxColour,
                             ENUM_LINE_STYLE lineStyle,
                             int lineWidth,
                             bool filled,
                             bool behindCandles)
  {
   bool created = false;
   if(ObjectFind(0, name) < 0)
     {
      if(!ObjectCreate(0, name, OBJ_RECTANGLE, 0, time1, price1, time2, price2))
         return;
      created = true;
     }

   if(created || (datetime)ObjectGetInteger(0, name, OBJPROP_TIME1) != time1)
     { ObjectSetInteger(0, name, OBJPROP_TIME1, time1); g_chartDirty = true; }
   if(created || MathAbs(ObjectGetDouble(0, name, OBJPROP_PRICE1) - price1) > Point * 0.1)
     { ObjectSetDouble(0, name, OBJPROP_PRICE1, price1); g_chartDirty = true; }
   if(created || (datetime)ObjectGetInteger(0, name, OBJPROP_TIME2) != time2)
     { ObjectSetInteger(0, name, OBJPROP_TIME2, time2); g_chartDirty = true; }
   if(created || MathAbs(ObjectGetDouble(0, name, OBJPROP_PRICE2) - price2) > Point * 0.1)
     { ObjectSetDouble(0, name, OBJPROP_PRICE2, price2); g_chartDirty = true; }

   SetIntegerIfChanged(name, OBJPROP_COLOR, boxColour, created);
   SetIntegerIfChanged(name, OBJPROP_STYLE, lineStyle, created);
   SetIntegerIfChanged(name, OBJPROP_WIDTH, lineWidth, created);
   SetIntegerIfChanged(name, OBJPROP_FILL, filled, created);
   SetIntegerIfChanged(name, OBJPROP_BACK, behindCandles, created);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

string MoneyText(double value)
  {
   int decimals = (Digits >= 2 ? 2 : Digits);
   return("$" + DoubleToString(value, decimals));
  }

string TimeText(int hour, int minute)
  {
   return(StringFormat("%02d:%02d", hour, minute));
  }

string FormatMinutesSeconds(int totalSeconds)
  {
   if(totalSeconds < 0)
      totalSeconds = 0;
   return(StringFormat("%02d:%02d", totalSeconds / 60, totalSeconds % 60));
  }

datetime CityLocalToUtc(int year, int month, int day,
                        int hour, int minute, int cityUtcOffset)
  {
   MqlDateTime parts;
   ZeroMemory(parts);
   parts.year = year;
   parts.mon = month;
   parts.day = day;
   parts.hour = hour;
   parts.min = minute;
   return(StructToTime(parts) - cityUtcOffset);
  }

int LondonUtcOffsetSeconds(datetime utc)
  {
   MqlDateTime dt;
   TimeToStruct(utc, dt);
   datetime start = LastSundayUtc(dt.year, 3, 1);
   datetime finish = LastSundayUtc(dt.year, 10, 1);
   return((utc >= start && utc < finish) ? 3600 : 0);
  }

int NewYorkUtcOffsetSeconds(datetime utc)
  {
   MqlDateTime dt;
   TimeToStruct(utc, dt);
   datetime start = NthSundayUtc(dt.year, 3, 2, 7);
   datetime finish = NthSundayUtc(dt.year, 11, 1, 6);
   return((utc >= start && utc < finish) ? -4 * 3600 : -5 * 3600);
  }

datetime LastSundayUtc(int year, int month, int hour)
  {
   int nextMonth = month + 1;
   int nextYear = year;
   if(nextMonth == 13)
     { nextMonth = 1; nextYear++; }

   MqlDateTime d;
   ZeroMemory(d);
   d.year = nextYear;
   d.mon = nextMonth;
   d.day = 1;
   datetime firstNextMonth = StructToTime(d);
   datetime lastDay = firstNextMonth - 86400;
   MqlDateTime last;
   TimeToStruct(lastDay, last);
   return(lastDay - last.day_of_week * 86400 + hour * 3600);
  }

datetime NthSundayUtc(int year, int month, int nth, int hour)
  {
   MqlDateTime d;
   ZeroMemory(d);
   d.year = year;
   d.mon = month;
   d.day = 1;
   datetime firstDay = StructToTime(d);
   MqlDateTime first;
   TimeToStruct(firstDay, first);
   int daysToSunday = (7 - first.day_of_week) % 7;
   return(firstDay + daysToSunday * 86400 + (nth - 1) * 7 * 86400 + hour * 3600);
  }

bool IsRightCorner()
  {
   return(Table_Corner == CORNER_RIGHT_UPPER || Table_Corner == CORNER_RIGHT_LOWER);
  }

bool IsLowerCorner()
  {
   return(Table_Corner == CORNER_LEFT_LOWER || Table_Corner == CORNER_RIGHT_LOWER);
  }

void DeleteRowObjects(int sessionId)
  {
   for(int c = 0; c < 8; c++)
      DeleteObject(RowName(sessionId, c));
  }

void DeleteTableObjects()
  {
   DeleteObject(PREFIX + "TABLE_TITLE");
   for(int c = 0; c < 8; c++)
      DeleteObject(PREFIX + "H_" + IntegerToString(c));
   for(int s = 0; s < 3; s++)
      DeleteRowObjects(s);
  }

void DeleteSessionBoxes(int sessionId)
  {
   string base = PREFIX + IntegerToString(sessionId) + "_";
   DeleteObject(base + "FULL_BOX");
   DeleteObject(base + "TRADING_BOX");
  }

void DeleteObject(string name)
  {
   if(ObjectFind(0, name) >= 0)
     {
      ObjectDelete(0, name);
      g_chartDirty = true;
     }
  }

void DeleteAllIndicatorObjects()
  {
   int total = ObjectsTotal(0, 0, -1);
   for(int i = total - 1; i >= 0; i--)
     {
      string name = ObjectName(0, i, 0, -1);
      if(StringFind(name, PREFIX) == 0)
         ObjectDelete(0, name);
     }
  }

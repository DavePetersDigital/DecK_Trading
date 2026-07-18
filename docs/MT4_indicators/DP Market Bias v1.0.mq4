#property strict
#property indicator_chart_window
#property indicator_plots 0

enum BiasState
  {
   BIAS_NEUTRAL = 0,
   BIAS_BULLISH = 1,
   BIAS_BEARISH = -1
  };

input string General_Settings = "===== GENERAL =====";
input bool Show_Text_Panel = true;
input bool Change_Chart_Background = true;
input bool Restore_Original_Background_On_Exit = true;
input int EMA_Period = 200;
input int EMA_Slope_Lookback_Bars = 5;
input bool Use_Completed_Candles_Only = true;

input string Panel_Settings = "===== PANEL =====";
input ENUM_BASE_CORNER Panel_Corner = CORNER_LEFT_UPPER;
input int Panel_X = 0;
input int Panel_Y = 12;
input int Panel_Width = 420;
input int Panel_Height = 96;
input int Panel_Font_Size = 14;
input int Bias_Font_Size = 22;
input color Panel_Background_Colour = clrWhiteSmoke;
input color Panel_Border_Colour = clrSilver;
input color Panel_Label_Colour = clrBlack;

input string Bias_Colours = "===== BIAS COLOURS =====";
input color Bullish_Text_Colour = clrForestGreen;
input color Bearish_Text_Colour = clrFireBrick;
input color Neutral_Text_Colour = clrDarkOrange;
input color Bullish_Background_Colour = clrHoneydew;
input color Bearish_Background_Colour = clrMistyRose;
input color Neutral_Background_Colour = clrWhite;

string PREFIX;
color originalBackground;
bool originalBackgroundStored = false;

//+------------------------------------------------------------------+
int OnInit()
  {
   IndicatorShortName("DP Market Bias");
   PREFIX = "DP_BIAS_V10_" + IntegerToString((int)ChartID()) + "_";

   originalBackground = (color)ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   originalBackgroundStored = true;

   EventSetTimer(5);
   UpdateBias();

   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   DeleteIndicatorObjects();

   if(Restore_Original_Background_On_Exit && originalBackgroundStored)
     {
      ChartSetInteger(0, CHART_COLOR_BACKGROUND, originalBackground);
      ChartRedraw(0);
     }
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
   if(prev_calculated == 0)
      UpdateBias();

   return(rates_total);
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   UpdateBias();
  }

//+------------------------------------------------------------------+
void UpdateBias()
  {
   int dailyBias = CalculateTrend(PERIOD_D1);
   int h4Bias = CalculateTrend(PERIOD_H4);

   int overallBias = BIAS_NEUTRAL;

   if(dailyBias == BIAS_BULLISH && h4Bias == BIAS_BULLISH)
      overallBias = BIAS_BULLISH;
   else if(dailyBias == BIAS_BEARISH && h4Bias == BIAS_BEARISH)
      overallBias = BIAS_BEARISH;

   if(Change_Chart_Background)
      ApplyBackground(overallBias);
   else if(originalBackgroundStored)
      ChartSetInteger(0, CHART_COLOR_BACKGROUND, originalBackground);

   if(Show_Text_Panel)
      DrawPanel(dailyBias, h4Bias, overallBias);
   else
      DeleteIndicatorObjects();

   ChartRedraw(0);
  }

//+------------------------------------------------------------------+
int CalculateTrend(ENUM_TIMEFRAMES timeframe)
  {
   int shift = Use_Completed_Candles_Only ? 1 : 0;
   int lookback = MathMax(EMA_Slope_Lookback_Bars, 1);

   double price = iClose(Symbol(), timeframe, shift);
   double emaNow = iMA(Symbol(), timeframe, EMA_Period, 0, MODE_EMA, PRICE_CLOSE, shift);
   double emaPast = iMA(Symbol(), timeframe, EMA_Period, 0, MODE_EMA, PRICE_CLOSE, shift + lookback);

   if(price <= 0.0 || emaNow <= 0.0 || emaPast <= 0.0)
      return(BIAS_NEUTRAL);

   bool emaRising = emaNow > emaPast;
   bool emaFalling = emaNow < emaPast;

   if(price > emaNow && emaRising)
      return(BIAS_BULLISH);

   if(price < emaNow && emaFalling)
      return(BIAS_BEARISH);

   return(BIAS_NEUTRAL);
  }

//+------------------------------------------------------------------+
void ApplyBackground(int overallBias)
  {
   color target = Neutral_Background_Colour;

   if(overallBias == BIAS_BULLISH)
      target = Bullish_Background_Colour;
   else if(overallBias == BIAS_BEARISH)
      target = Bearish_Background_Colour;

   if((color)ChartGetInteger(0, CHART_COLOR_BACKGROUND) != target)
      ChartSetInteger(0, CHART_COLOR_BACKGROUND, target);
  }

//+------------------------------------------------------------------+
void DrawPanel(int dailyBias, int h4Bias, int overallBias)
  {
   int chartWidth = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int x = Panel_X;

   // Top-centre is achieved by centring the panel horizontally.
   if(Panel_Corner == CORNER_LEFT_UPPER || Panel_Corner == CORNER_LEFT_LOWER)
      x = MathMax(0, (chartWidth - Panel_Width) / 2 + Panel_X);

   string panel = PREFIX + "PANEL";
   string d1 = PREFIX + "D1";
   string h4 = PREFIX + "H4";
   string bias = PREFIX + "BIAS";

   CreatePanel(panel, x, Panel_Y);

   string d1Text = "D1: " + BiasText(dailyBias);
   string h4Text = "H4: " + BiasText(h4Bias);
   string overallText = OverallText(overallBias);

   CreateLabel(d1, x + 18, Panel_Y + 14, d1Text,
               BiasColour(dailyBias), Panel_Font_Size, false);

   CreateLabel(h4, x + Panel_Width - 150, Panel_Y + 14, h4Text,
               BiasColour(h4Bias), Panel_Font_Size, false);

   CreateLabel(bias, x + Panel_Width / 2, Panel_Y + 48, overallText,
               BiasColour(overallBias), Bias_Font_Size, true, ANCHOR_CENTER);
  }

//+------------------------------------------------------------------+
void CreatePanel(string name, int x, int y)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);

   ObjectSetInteger(0, name, OBJPROP_CORNER, Panel_Corner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, Panel_Width);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, Panel_Height);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, Panel_Background_Colour);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, Panel_Border_Colour);
   ObjectSetInteger(0, name, OBJPROP_COLOR, Panel_Border_Colour);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

//+------------------------------------------------------------------+
void CreateLabel(string name,
                 int x,
                 int y,
                 string text,
                 color clr,
                 int fontSize,
                 bool bold,
                 ENUM_ANCHOR_POINT anchor = ANCHOR_LEFT_UPPER)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);

   ObjectSetInteger(0, name, OBJPROP_CORNER, Panel_Corner);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetString(0, name, OBJPROP_FONT, bold ? "Arial Bold" : "Arial");
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

//+------------------------------------------------------------------+
string BiasText(int state)
  {
   if(state == BIAS_BULLISH)
      return("BULLISH");

   if(state == BIAS_BEARISH)
      return("BEARISH");

   return("NEUTRAL");
  }

//+------------------------------------------------------------------+
string OverallText(int state)
  {
   if(state == BIAS_BULLISH)
      return("LONGS ONLY");

   if(state == BIAS_BEARISH)
      return("SHORTS ONLY");

   return("NOT ALIGNED");
  }

//+------------------------------------------------------------------+
color BiasColour(int state)
  {
   if(state == BIAS_BULLISH)
      return(Bullish_Text_Colour);

   if(state == BIAS_BEARISH)
      return(Bearish_Text_Colour);

   return(Neutral_Text_Colour);
  }

//+------------------------------------------------------------------+
void DeleteIndicatorObjects()
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

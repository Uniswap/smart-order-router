"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setGlobalMetric = exports.metric = exports.MetricLogger = exports.IMetric = exports.MetricLoggerUnit = void 0;
const log_1 = require("./log");
var MetricLoggerUnit;
(function (MetricLoggerUnit) {
    MetricLoggerUnit["Seconds"] = "Seconds";
    MetricLoggerUnit["Microseconds"] = "Microseconds";
    MetricLoggerUnit["Milliseconds"] = "Milliseconds";
    MetricLoggerUnit["Bytes"] = "Bytes";
    MetricLoggerUnit["Kilobytes"] = "Kilobytes";
    MetricLoggerUnit["Megabytes"] = "Megabytes";
    MetricLoggerUnit["Gigabytes"] = "Gigabytes";
    MetricLoggerUnit["Terabytes"] = "Terabytes";
    MetricLoggerUnit["Bits"] = "Bits";
    MetricLoggerUnit["Kilobits"] = "Kilobits";
    MetricLoggerUnit["Megabits"] = "Megabits";
    MetricLoggerUnit["Gigabits"] = "Gigabits";
    MetricLoggerUnit["Terabits"] = "Terabits";
    MetricLoggerUnit["Percent"] = "Percent";
    MetricLoggerUnit["Count"] = "Count";
    MetricLoggerUnit["BytesPerSecond"] = "Bytes/Second";
    MetricLoggerUnit["KilobytesPerSecond"] = "Kilobytes/Second";
    MetricLoggerUnit["MegabytesPerSecond"] = "Megabytes/Second";
    MetricLoggerUnit["GigabytesPerSecond"] = "Gigabytes/Second";
    MetricLoggerUnit["TerabytesPerSecond"] = "Terabytes/Second";
    MetricLoggerUnit["BitsPerSecond"] = "Bits/Second";
    MetricLoggerUnit["KilobitsPerSecond"] = "Kilobits/Second";
    MetricLoggerUnit["MegabitsPerSecond"] = "Megabits/Second";
    MetricLoggerUnit["GigabitsPerSecond"] = "Gigabits/Second";
    MetricLoggerUnit["TerabitsPerSecond"] = "Terabits/Second";
    MetricLoggerUnit["CountPerSecond"] = "Count/Second";
    MetricLoggerUnit["None"] = "None";
})(MetricLoggerUnit = exports.MetricLoggerUnit || (exports.MetricLoggerUnit = {}));
class IMetric {
}
exports.IMetric = IMetric;
class MetricLogger extends IMetric {
    constructor(context) {
        super();
        this.log = log_1.log.child(context || {});
    }
    setProperty(key, value) {
        this.log = this.log.child({ [key]: value });
    }
    putDimensions(dimensions) {
        this.log = this.log.child(dimensions);
    }
    putMetric(key, value, unit) {
        this.log.info({ key, value, unit }, `[Metric]: ${key}: ${value} | ${unit ? unit : ''}`);
    }
}
exports.MetricLogger = MetricLogger;
exports.metric = new MetricLogger();
const setGlobalMetric = (_metric) => {
    exports.metric = _metric;
};
exports.setGlobalMetric = setGlobalMetric;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0cmljLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3V0aWwvbWV0cmljLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUVBLCtCQUE0QjtBQUU1QixJQUFZLGdCQTRCWDtBQTVCRCxXQUFZLGdCQUFnQjtJQUMxQix1Q0FBbUIsQ0FBQTtJQUNuQixpREFBNkIsQ0FBQTtJQUM3QixpREFBNkIsQ0FBQTtJQUM3QixtQ0FBZSxDQUFBO0lBQ2YsMkNBQXVCLENBQUE7SUFDdkIsMkNBQXVCLENBQUE7SUFDdkIsMkNBQXVCLENBQUE7SUFDdkIsMkNBQXVCLENBQUE7SUFDdkIsaUNBQWEsQ0FBQTtJQUNiLHlDQUFxQixDQUFBO0lBQ3JCLHlDQUFxQixDQUFBO0lBQ3JCLHlDQUFxQixDQUFBO0lBQ3JCLHlDQUFxQixDQUFBO0lBQ3JCLHVDQUFtQixDQUFBO0lBQ25CLG1DQUFlLENBQUE7SUFDZixtREFBK0IsQ0FBQTtJQUMvQiwyREFBdUMsQ0FBQTtJQUN2QywyREFBdUMsQ0FBQTtJQUN2QywyREFBdUMsQ0FBQTtJQUN2QywyREFBdUMsQ0FBQTtJQUN2QyxpREFBNkIsQ0FBQTtJQUM3Qix5REFBcUMsQ0FBQTtJQUNyQyx5REFBcUMsQ0FBQTtJQUNyQyx5REFBcUMsQ0FBQTtJQUNyQyx5REFBcUMsQ0FBQTtJQUNyQyxtREFBK0IsQ0FBQTtJQUMvQixpQ0FBYSxDQUFBO0FBQ2YsQ0FBQyxFQTVCVyxnQkFBZ0IsR0FBaEIsd0JBQWdCLEtBQWhCLHdCQUFnQixRQTRCM0I7QUFFRCxNQUFzQixPQUFPO0NBTTVCO0FBTkQsMEJBTUM7QUFPRCxNQUFhLFlBQWEsU0FBUSxPQUFPO0lBR3ZDLFlBQVksT0FBdUI7UUFDakMsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsR0FBRyxHQUFHLFNBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFTSxXQUFXLENBQUMsR0FBVyxFQUFFLEtBQWM7UUFDNUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRU0sYUFBYSxDQUFDLFVBQWtDO1FBQ3JELElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVNLFNBQVMsQ0FBQyxHQUFXLEVBQUUsS0FBYSxFQUFFLElBQXVCO1FBQ2xFLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUNYLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFDcEIsYUFBYSxHQUFHLEtBQUssS0FBSyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FDbkQsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQXRCRCxvQ0FzQkM7QUFFVSxRQUFBLE1BQU0sR0FBWSxJQUFJLFlBQVksRUFBRSxDQUFDO0FBRXpDLE1BQU0sZUFBZSxHQUFHLENBQUMsT0FBZ0IsRUFBRSxFQUFFO0lBQ2xELGNBQU0sR0FBRyxPQUFPLENBQUM7QUFDbkIsQ0FBQyxDQUFDO0FBRlcsUUFBQSxlQUFlLG1CQUUxQiJ9
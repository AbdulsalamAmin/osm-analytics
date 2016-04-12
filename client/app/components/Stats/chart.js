import React, { Component, PropTypes } from 'react'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import vg from 'vega'
import { debounce } from 'lodash'
import * as StatsActions from '../../actions/stats'

class Histogram extends Component {
  state = {
    vis: null
  }

  _brushStart = null

  componentDidMount() {
    const { mode } = this.props

    this.initGraph(mode)
  }

  initGraph(mode) {
    const spec = this._spec(mode)

    vg.parse.spec(spec, chart => {
      const vis = chart({
        el: this.refs.chartContainer,
        renderer: 'svg'
      })

      vis.onSignal('brush_start', debounce(::this.setFilter, 10))
      vis.onSignal('brush_end', debounce(::this.setFilter, 200))

      vis.data('activity').insert([]) // actual data comes later ^^
      vis.update()

      const _prevWindowOnresize = window.onresize
      window.onresize = function(...args) {
        _prevWindowOnresize && _prevWindowOnresize.apply(this, args)
        vis.width(window.innerWidth-90).update()
      }
      vis.width(window.innerWidth-90).update()

      this.setState({ vis })
    })
  }

  setFilter(signal, value) {
    const { actions, mode } = this.props
    if (signal === 'brush_start') {
      this._brushStart = value
    } else {
      if (mode === 'recency') {
        if (this._brushStart - value === 0) {
          // startTime === endTime -> reset time filter
          actions.setTimeFilter(null)
        } else {
          actions.setTimeFilter([
            Math.min(this._brushStart, value)/1000,
            Math.max(this._brushStart, value)/1000
          ])
        }
      } else {
        if (this._brushStart - value === 0) {
          // startTime === endTime -> reset time filter
          actions.setExperienceFilter(null)
        } else {
          actions.setExperienceFilter([
            Math.pow(2, /*Math.floor*/(Math.min(this._brushStart, value))),
            Math.pow(2, /*Math.ceil */(Math.max(this._brushStart, value)))
          ])
        }
      }
    }
  }


  componentDidUpdate() {
    const { vis } = this.state
    const { data, mode } = this.props

    if (vis) {
      // update data in case it changed
      let bins = {}
      if (mode === 'recency') {
        data.forEach(feature => {
          let day = new Date(feature.properties._timestamp*1000)
          day.setMilliseconds(0)
          day.setSeconds(0)
          day.setMinutes(0)
          day.setHours(0)
          day = +day
          if (!bins[day]) bins[day] = 0
          bins[day]++
        })
        bins = Object.keys(bins).map(day => ({
          day: +day,
          count_day: bins[day]
        }))
      } else {
        data.forEach(feature => {
          let experienceBin = Math.floor(Math.log2(feature.properties._userExperience))
          if (!bins[experienceBin]) bins[experienceBin] = 0
          bins[experienceBin]++
        })
        bins = Object.keys(bins).map(experience => ({
          experience: +experience,
          count_experience: bins[experience]
        }))
      }

      vis.data('activity').remove(() => true).insert(bins)

      vis.update()
    }
  }

  render() {
    return (
      <div ref="chartContainer" className="chart" title="click-drag to select date or experience range"/>
    )
  }


  _spec(mode) {
    const activityMode = mode === 'recency'
    return {
      "width": 1e6, // set initally very high to avoid non-updating clipping boundaries causing issues
      "height": 100,
      "padding": {"top": 10, "left": 40, "bottom": 30, "right": 5},

      "signals": [
        {
          "name": "brush_start",
          "init": {},
          "streams": [{
            "type": "mousedown",
            "expr": "iscale('x', clamp(eventX(), 0, width))"
          }]
        },
        {
          "name": "brush_end",
          "init": {},
          "streams": [{
            "type": "mousedown, [mousedown, window:mouseup] > window:mousemove",
            "expr": "iscale('x', clamp(eventX(), 0, width))"
          }]
        },

        // the commented out part would enable panning, but interferes with the brushing above.
        // todo: check if this can be done via some modifier key or something...
        /*{
          "name": "point",
          "init": 0,
          "streams": [{
            "type": "mousedown",
            "expr": "eventX()"
          }]
        },
        {
          "name": "delta",
          "init": 0,
          "streams": [{
            "type": "[mousedown, window:mouseup] > window:mousemove",
            "expr": "point.x - eventX()"
          }]
        },*/
        {
          "name": "xAnchor",
          "init": 0,
          "streams": [{
            "type": "mousemove",
            "expr": activityMode
              ? "+datetime(iscale('x', clamp(eventX(), 0, width)))"
              : "iscale('x', clamp(eventX(), 0, width))"
          }]
        },
        {
          "name": "zoom",
          "init": 1.0,
          "verbose": true,
          "streams": [
            {"type": "wheel", "expr": "pow(1.01, event.deltaY*pow(16, event.deltaMode))"}
          ]
        },
        {
          "name": "xs",
          "streams": [{
            "type": "mousedown, mouseup, wheel",
            "expr": "{min: xMin, max: xMax}"}
          ]
        },
        {
          "name": "xMin",
          "init": activityMode
            ? +(new Date("2004-08-09"))
            : undefined, // todo: ???
          "streams": [
            //{"type": "delta", "expr": "+datetime(xs.min + (xs.max-xs.min)*delta/width)"},
            {
              "type": "zoom",
              "expr": activityMode
                ? "max(+datetime((xs.min-xAnchor)*zoom + xAnchor), "+(+(new Date("2004-08-09")))+")"
                : "(xs.min-xAnchor)*zoom + xAnchor" // todo: limit to min bound
            }
          ]
        },
        {
          "name": "xMax",
          "init": activityMode
            ? +(new Date())
            : undefined, // todo: ???
          "streams": [
            //{"type": "delta", "expr": "+datetime(xs.max + (xs.max-xs.min)*delta.x/width)"},
            {
              "type": "zoom",
              "expr": activityMode
                ? "min(+datetime((xs.max-xAnchor)*zoom + xAnchor), "+(+(new Date()))+")"
                : "(xs.max-xAnchor)*zoom + xAnchor" // todo: limit to max bound
            }
          ]
        },
        {
          "name": "binWidth",
          "init": activityMode
            ? 2
            : 40,
          "streams": [{
            "type": "xMin",
            "expr": activityMode
              ? "max(width*86400000/(xMax-xMin), 2)"
              : "40" // todo: hmmm…
          }]
        }
      ],

      "data": [
        {
          "name": "activity",
          "format": {"type": "json", "parse": {"day": "date"}}
        },
      ],
      "scales": [
        {
          "name": "x",
          "type": activityMode
            ? "time"
            : "linear",
          "range": "width",
          "domain": {
            "data": "activity",
            "field": activityMode
              ? "day"
              : "experience"
          },
          "domainMin": {"signal": "xMin"},
          "domainMax": {"signal": "xMax"}
        },
        {
          "name": "y",
          "type": "linear",
          "range": "height",
          "domain": {
            "data": "activity",
            "field": activityMode
              ? "count_day"
              : "count_experience"
          }
        }
      ],
      "axes": [{
        "type": "x",
        "scale": "x",
        "grid": false,
        "layer": "back",
        "properties": {
           "axis": {
             "stroke": {"value": "#C2C2C2"},
             "strokeWidth": {"value": 1}
           },
           "ticks": {
             "stroke": {"value": "#C2C2C2"}
           },
           "majorTicks": {
             "strokeWidth": {"value": 2}
           },
          "labels": {
            "fontSize": {"value": 14},
            "fill": {"value": "#BCBCBC"},
          }
        }
      }],
      "marks": [
        {
          "type": "group",
          "properties": {
            "enter": {
              "x": {"value": 0},
              "width": {"field": {"group": "width"}},
              "y": {"value": 0},
              "height": {"field": {"group": "height"}},
              "clip": {"value": false}
            }
          },
          "marks": [
            {
              "type": "rect",
              "properties": {
                "enter": {
                  "fill": {"value": "#72DDEF"},
                  "fillOpacity": {"value": 0.3}
                },
                "update": {
                  "x": {"scale": "x", "signal": "brush_start"},
                  "x2": {"scale": "x", "signal": "brush_end"},
                  "y": {"value": 30},
                  "height": {"value": 70}
                }
              }
            },
            {
              "type": "rect",
              "properties": {
                "enter": {
                  "fill": {"value": "#BCE3E9"},
                  "fillOpacity": {"value": 1}
                },
                "update": {
                  "x": {"scale": "x", "signal": "brush_start"},
                  "width": [
                    { "test": "brush_start>brush_end || brush_start<brush_end", // == doesn't seem to work for whatever reason… wtf?
                      "value": 2
                    },
                    {"value": 0}
                  ],
                  "y": {"value": 30-8},
                  "height": {"value": 70+2*8}
                }
              }
            },
            {
              "type": "rect",
              "properties": {
                "enter": {
                  "fill": {"value": "#BCE3E9"},
                  "fillOpacity": {"value": 1}
                },
                "update": {
                  "x": {"scale": "x", "signal": "brush_end"},
                  "width": [
                    { "test": "brush_start>brush_end || brush_start<brush_end",
                      "value": 2
                    },
                    {"value": 0}
                  ],
                  "y": {"value": 30-8},
                  "height": {"value": 70+2*8}
                }
              }
            }
          ]
        },
        {
          "type": "group",
          "properties": {
            "enter": {
              "x": {"value": 0},
              "width": {"field": {"group": "width"}},
              "y": {"value": 0},
              "height": {"field": {"group": "height"}},
              "clip": {"value": true}
            }
          },
          "marks": [
            {
              "type": "rect",
              "from": {"data": "activity"},
              "properties": {
                "enter": {
                },
                "update": {
                  "x": {"scale": "x",
                    "field": activityMode
                      ? "day"
                      : "experience"
                  },
                  "width": {"signal": "binWidth"},
                  "y": {"scale": "y",
                    "field": activityMode
                      ? "count_day"
                      : "count_experience"
                  },
                  "y2": {"scale": "y", "value": 0},
                  "fill": [
                    {
                      "test": activityMode
                      ? "inrange(datum.day, brush_start, brush_end)"
                      : "inrange(datum.experience, brush_start, brush_end)",
                        "value": "#DADADA"
                    },
                    {"value": "#ACACAC"}
                  ]
                }
              }
            }
          ]
        }
      ]
    }
  }
}


function mapStateToProps(state) {
  return {
    // todo: handle filters & overlays via state.map.*
  }
}

function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators(StatsActions, dispatch)
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Histogram)

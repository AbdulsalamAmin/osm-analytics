import React, { Component } from 'react'
import style from './style.css'
import glStyle from './buildings.json'

class About extends Component {
  render() {
    return (
      <div className="tmp">
      <div id='map'></div>
      <button className='outline'>Outline Custom Area</button>
      <button className='filter'>Filter Map Features</button>
      <button className='overlay'>…</button>
      </div>
    )
  }

  componentDidMount() {
    if (process.env.NODE_ENV !== 'production') {
      glStyle.sources['osm-buildings-aggregated'].tiles[0] = glStyle.sources['osm-buildings-aggregated'].tiles[0].replace('52.50.120.37', 'localhost')
      glStyle.sources['osm-buildings-raw'].tiles[0] = glStyle.sources['osm-buildings-raw'].tiles[0].replace('52.50.120.37', 'localhost')
    }

    mapboxgl.accessToken = 'pk.eyJ1IjoidHlyIiwiYSI6ImNpbHhyNWlxNDAwZXh3OG01cjdnOHV0MXkifQ.-Bj4ZYdiph9V5J8XpRMWtw';
    var map = new mapboxgl.Map({
      container: 'map',
      center: [0, 35],
      zoom: 2,
      style: glStyle,
      hash: false
    });

    map.on("mousemove", function(e) {
      map.featuresAt(e.point, { radius: 1, includeGeometry: true }, function(err, features) {
        if (features.length)
          console.log(features[0]);
      })
    });
  }
}

export default About

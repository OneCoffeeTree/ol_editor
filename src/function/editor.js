
import { Translate } from 'ol/interaction';
import RotateFeatureInteraction from 'ol-rotate-feature';
import { getLength } from 'ol/sphere';
import GeoJSON from 'ol/format/GeoJSON';
import Feature from 'ol/Feature';
import { Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, Circle as CircleFeature } from 'ol/geom';
import { Draw } from 'ol/interaction';

import { centroid, simplify } from '@turf/turf';

import { GeoJSONWriter, GeoJSONReader } from 'jsts/org/locationtech/jts/io';
import { AffineTransformation } from 'jsts/org/locationtech/jts/geom/util';
import MinimumDiameter from 'jsts/org/locationtech/jts/algorithm/MinimumDiameter';
import LineSegment from 'jsts/org/locationtech/jts/geom/LineSegment';
import DistanceOp from 'jsts/org/locationtech/jts/operation/distance/DistanceOp';
import UnionOp from 'jsts/org/locationtech/jts/operation/union/UnionOp';
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer';
import { LineMerger } from 'jsts/org/locationtech/jts/operation/linemerge';

const editors = {
	// 피쳐 이동 => ol interaction 활용(Translate)
	featureMove: (map, feature) => {
		const translateE = new Translate();
		map.addInteraction(translateE);
	},
	// 피쳐 회전 => ol-rotate-featue plugin 활용 및 중심점을 구하기 위해 turfjs 활용(centroid)
	rotate: (map, features, style) => {
		const featureGeom = {
			type: features[0].getGeometry().getType(),
			coordinates: features[0].getGeometry().getCoordinates()
		}
		const centroidPoint = centroid(featureGeom);
		const rotate = new RotateFeatureInteraction({
			features: features,
			anchor: centroidPoint.geometry.coordinates,
			angle: -90 * Math.PI / 180,	// 디그리값에서 라디안 값으로 변경하기 위해 pi/180 를 곱함	// 기존 상태가 90도 위치인것으로 추정
			style,
		});
		map.addInteraction(rotate);
	},
	//라인 직선화 => coordinate 변경
	lineStraight: (feature) => {
		const geom = feature.getGeometry();

		if (feature.getGeometry().getType().indexOf('Multi') !== -1) {
			// console.log(geom.getCoordinates()); 	// 3차원 배열 나옴 (각 LineString , LineString의 각 snap , 각 snap의 x-y 순서쌍)
			let newGeom = new Array();
			for (let i = 0; i < geom.getCoordinates().length; i++) { // MultiLineString 이라서 geom.getCoordinates().length; 시 LineString 의 개수가 나옴
				newGeom.push([geom.getCoordinates()[i][0], geom.getCoordinates()[i][geom.getCoordinates()[i].length - 1]]);	// i번째 선분의 시작점과 끝점을 가지고 선분을 다시만듬
			}
			geom.setCoordinates(newGeom);
		} else { // singleLinestring 의 경우
			// console.log(geom.getCoordinates()); // 2차원 배열 나옴 (각 snap, x-y순서쌍)
			const newGeom = [geom.getCoordinates()[0], geom.getCoordinates()[geom.getCoordinates().length - 1]];	// 0번째와 마지막만 가지고 직선을 다시 만듬
			geom.setCoordinates(newGeom);
		}
		feature.setGeometry(geom);
	},
	//라인 방향반전 => coordinate 변경
	lineReverse: (feature) => {
		const geom = feature.getGeometry();
		console.log(geom);
		if (feature.getGeometry().getType().indexOf('Multi') !== -1) {	// 바로 위의 직선화와 유사한 구조
			let newGeom = new Array();
			for (let i = 0; i < geom.getCoordinates().length; i++) {
				newGeom.push(geom.getCoordinates()[i].reverse()); // 배열이기 때문에 reverse() 함수로 배열의 순서를 뒤집어 snap들의 순서를 바꿈 
			}
			geom.setCoordinates(newGeom);
		} else {
			const newGeom = geom.getCoordinates().reverse();
			geom.setCoordinates(newGeom);
		}

		feature.setGeometry(geom);
	},
	//폴리곤, 라인 단순화 => turfjs 활용(simplify)	// https://www.npmjs.com/package/@turf/simplify
	simplify: (feature) => {
		const featureGeom = {
			type: feature.getGeometry().getType(),
			coordinates: feature.getGeometry().getCoordinates()
		}
		// tolerance options
		// percentage (ex) 아래의 0.05*length를 하여 길이를 구하여 입력)
		// meter (ex) meter 값 입력)
		const length = getLength(feature.getGeometry());
		const tolerance = length * (0.05);
		const options = { tolerance, highQuality: false };
		const simplified = simplify(featureGeom, options);

		const geoJson = new GeoJSON();
		const geom = geoJson.readGeometry(simplified);
		feature.setGeometry(geom);
	},
	// 반전(type => 짧은축:short, 긴축:long)
	reflect: (type, feature) => {
		const featureGeom = {
			type: feature.getGeometry().getType(),
			coordinates: feature.getGeometry().getCoordinates()
		}

		const reader = new GeoJSONReader();
		const geoJson = new GeoJSON();
		const writer = new GeoJSONWriter();
		const affine = new AffineTransformation();

		const minimumDia = new MinimumDiameter(reader.read(featureGeom), false);
		let minimumRec = minimumDia.getMinimumRectangle();
		if (minimumDia.getMinimumRectangle().getCoordinates().length > 2) {
			const point1 = reader.read({ type: 'Point', coordinates: [minimumRec.getCoordinates()[0].x, minimumRec.getCoordinates()[0].y] });
			const point2 = reader.read({ type: 'Point', coordinates: [minimumRec.getCoordinates()[1].x, minimumRec.getCoordinates()[1].y] });
			const point3 = reader.read({ type: 'Point', coordinates: [minimumRec.getCoordinates()[2].x, minimumRec.getCoordinates()[2].y] });
			const point4 = reader.read({ type: 'Point', coordinates: [minimumRec.getCoordinates()[3].x, minimumRec.getCoordinates()[3].y] });

			let midpoint1 = new LineSegment(point1.getCoordinates()[0], point2.getCoordinates()[0]).midPoint();
			let midpoint2 = new LineSegment(point2.getCoordinates()[0], point3.getCoordinates()[0]).midPoint();
			let midpoint3 = new LineSegment(point3.getCoordinates()[0], point4.getCoordinates()[0]).midPoint();
			let midpoint4 = new LineSegment(point4.getCoordinates()[0], point1.getCoordinates()[0]).midPoint();

			let resultPoint1 = reader.read({ type: 'Point', coordinates: [midpoint1.x, midpoint1.y] });
			let resultPoint2 = reader.read({ type: 'Point', coordinates: [midpoint2.x, midpoint2.y] });
			let resultPoint3 = reader.read({ type: 'Point', coordinates: [midpoint3.x, midpoint3.y] });
			let resultPoint4 = reader.read({ type: 'Point', coordinates: [midpoint4.x, midpoint4.y] });

			let distance1 = new DistanceOp(resultPoint1, resultPoint3).distance();
			let distance2 = new DistanceOp(resultPoint2, resultPoint4).distance();

			let shortAxis;
			let longAxis;
			if (distance1 > distance2) {
				longAxis = [resultPoint1.getCoordinates()[0].x, resultPoint1.getCoordinates()[0].y, resultPoint3.getCoordinates()[0].x, resultPoint3.getCoordinates()[0].y];
				shortAxis = [resultPoint2.getCoordinates()[0].x, resultPoint2.getCoordinates()[0].y, resultPoint4.getCoordinates()[0].x, resultPoint4.getCoordinates()[0].y];
			} else {
				longAxis = [resultPoint2.getCoordinates()[0].x, resultPoint2.getCoordinates()[0].y, resultPoint4.getCoordinates()[0].x, resultPoint4.getCoordinates()[0].y];
				shortAxis = [resultPoint1.getCoordinates()[0].x, resultPoint1.getCoordinates()[0].y, resultPoint3.getCoordinates()[0].x, resultPoint3.getCoordinates()[0].y];
			}

			if (type === 'short') {
				affine.reflect(shortAxis[0], shortAxis[1], shortAxis[2], shortAxis[3]);
			} else if (type === 'long') {
				affine.reflect(longAxis[0], longAxis[1], longAxis[2], longAxis[3]);
			}
			const affineGeom = affine.transform(reader.read(featureGeom));
			const affineGeoJson = geoJson.readGeometry(writer.write(affineGeom));
			feature.setGeometry(affineGeoJson);
		}
	},
	//포인트 병합 (포인트들의 가운데 지점으로 병합)
	pointMerge: (features, map) => {
		//Point (가운데 병합)
		let coords = [];
		let layer = map.getLayers().getArray()[1];

		if (features[0].getGeometry().getType() === "Point") {
			let type = '';

			for (let item of features) {
				coords.push(item.getGeometry().getCoordinates());

				layer.getSource().removeFeature(item);
			}

			if (features.length > 2) {
				type = 'Polygon';
				coords.push(coords[0]);
				coords = [coords];
			} else {
				type = 'LineString';
			}

			// 중심점을 구하기 위한 geometry
			const featureGeom = {
				type: type,
				coordinates: coords
			}

			let centroidPoint = centroid(featureGeom);
			let newPoint = new Feature(new Point(centroidPoint.geometry.coordinates));

			map.getLayers().getArray()[1].getSource().addFeature(newPoint);

		} else if (features[0].getGeometry().getType() === "MultiPoint") {
			//MultiPoint 좌표 병합
			// for(let i=features.length-1; i>=0; i--){
			//   coords.push(features[i].getGeometry().getCoordinates());

			//   if(i !== 0){
			//     layer.getSource().removeFeature(features[i]);
			//   }
			// }

			// const geom = features[0].getGeometry();
			// geom.setCoordinates(coords);

			// features[0].setGeometry(geom);
			const reader = new GeoJSONReader();
			const writer = new GeoJSONWriter();
			const geoJson = new GeoJSON();
			const unionFunc = new UnionOp();

			let mergeGeom = null;
			for (let i = 0; i < features.length; i++) {
				if (!mergeGeom) {
					mergeGeom = reader.read({ type: features[i].getGeometry().getType(), coordinates: features[i].getGeometry().getCoordinates() });
				} else {
					const geom = reader.read({ type: features[i].getGeometry().getType(), coordinates: features[i].getGeometry().getCoordinates() });
					mergeGeom = unionFunc.getClass().union(mergeGeom, geom);
				}
			}

			features[0].setGeometry(geoJson.readGeometry(writer.write(mergeGeom)));
			for (let i = features.length - 1; i >= 0; i--) {
				if (i !== 0) {
					map.getLayers().getArray()[1].getSource().removeFeature(features[i]);
				}
			}
		}

	},
	//라인 병합
	lineStringMerge: (features, map) => {
		//LineString
		if (features[0].getGeometry().getType() === 'LineString') {
			const reader = new GeoJSONReader();
			const geoJson = new GeoJSON();
			const writer = new GeoJSONWriter();
			const merge = new LineMerger();

			// 병합할 수 있는지 Check
			for (let i = 0; i < features.length; i++) {
				let sNum = 0;
				let eNum = 0;
				let feature = features[i];
				for (let j = 0; j < features.length; j++) {
					if (i !== j) {
						const a = feature.getGeometry().getCoordinates();
						const b = features[j].getGeometry().getCoordinates();
						let sDuplicate = function (a, b) {
							if (a[0][0] === b[0][0] && a[0][1] === b[0][1]) {
								return true;
							}
							if (a[0][0] === b[b.length - 1][0] && a[0][1] === b[b.length - 1][1]) {
								return true;
							}
							return false;
						}
						let eDuplicate = function (a, b) {
							if (a[a.length - 1][0] === b[0][0] && a[a.length - 1][1] === b[0][1]) {
								return true;
							}
							if (a[a.length - 1][0] === b[b.length - 1][0] && a[a.length - 1][1] === b[b.length - 1][1]) {
								return true;
							}
							return false;
						}
						if (sDuplicate(a, b)) {
							sNum += 1;
						}
						if (eDuplicate(a, b)) {
							eNum += 1;
						}
					}
				}
				if (sNum === 0 && eNum === 0) {
					alert('병합 할 수 없습니다.');
					return;
				} else {
					break;
				}
			}

			// geometry merge
			for (let i = 0; i < features.length; i++) {
				const geomObj = {
					type: features[i].getGeometry().getType(),
					coordinates: features[i].getGeometry().getCoordinates()
				}
				const geom = reader.read(geomObj);
				merge.add(geom);
				if (i !== 0) {
					map.getLayers().getArray()[1].getSource().removeFeature(features[i]);
				}
			}

			// create merge geometry
			const newCoord = writer.write(merge.getMergedLineStrings().toArray()[0]).coordinates;
			const geomObj = {
				type: 'LineString',
				coordinates: newCoord
			}

			// setGeometry
			const newGeom = geoJson.readGeometry(geomObj);
			features[0].setGeometry(newGeom);
			// MultiLineString
		} else if (features[0].getGeometry().getType() === 'MultiLineString') {

			const reader = new GeoJSONReader();
			const writer = new GeoJSONWriter();
			const geoJson = new GeoJSON();
			const unionFunc = new UnionOp();

			let mergeGeom = null;
			for (let i = 0; i < features.length; i++) {
				if (!mergeGeom) {
					mergeGeom = reader.read({ type: features[i].getGeometry().getType(), coordinates: features[i].getGeometry().getCoordinates() });
				} else {
					const geom = reader.read({ type: features[i].getGeometry().getType(), coordinates: features[i].getGeometry().getCoordinates() });
					mergeGeom = unionFunc.getClass().union(mergeGeom, geom);
				}
			}

			features[0].setGeometry(geoJson.readGeometry(writer.write(mergeGeom)));
			for (let i = features.length - 1; i >= 0; i--) {
				if (i !== 0) {
					map.getLayers().getArray()[1].getSource().removeFeature(features[i]);
				}
			}
		}

	},
	//폴리곤 병합
	polygonMerge: (features, map) => {
		const reader = new GeoJSONReader();
		const writer = new GeoJSONWriter();
		const geoJson = new GeoJSON();
		const unionFunc = new UnionOp();

		// 폴리곤 병합
		if (features[0].getGeometry().getType() === 'Polygon') {
			let mergeGeom = null;
			for (let i = 0; i < features.length; i++) {
				if (!mergeGeom) {
					mergeGeom = reader.read({ type: features[i].getGeometry().getType(), coordinates: features[i].getGeometry().getCoordinates() });
				} else {
					const geom = reader.read({ type: features[i].getGeometry().getType(), coordinates: features[i].getGeometry().getCoordinates() });
					mergeGeom = unionFunc.getClass().union(mergeGeom, geom);
				}
			}

			if (mergeGeom.getGeometryType() !== features[0].getGeometry().getType()) {
				alert('대상 피쳐는 Polygon 이지만, 결과 피쳐는 MultiPolygon 입니다. 서로 겹치거나 맞닿아 있는 피쳐를 선택해서 병합해주세요.');
				return;
			} else {
				if (features[0].getGeometry().getType() === mergeGeom.getGeometryType()) {
					features[0].setGeometry(geoJson.readGeometry(writer.write(mergeGeom)));
					for (let i = features.length - 1; i >= 0; i--) {
						if (i !== 0) {
							map.getLayers().getArray()[1].getSource().removeFeature(features[i]);
						}
					}
				}
			}
		} else {
			//MultiPolygon 좌표 병합
			let mergeGeom = null;
			for (let i = 0; i < features.length; i++) {
				if (!mergeGeom) {
					mergeGeom = reader.read({ type: features[i].getGeometry().getType(), coordinates: features[i].getGeometry().getCoordinates() });
				} else {
					const geom = reader.read({ type: features[i].getGeometry().getType(), coordinates: features[i].getGeometry().getCoordinates() });
					mergeGeom = unionFunc.getClass().union(mergeGeom, geom);
				}
			}

			features[0].setGeometry(geoJson.readGeometry(writer.write(mergeGeom)));
			for (let i = features.length - 1; i >= 0; i--) {
				if (i !== 0) {
					map.getLayers().getArray()[1].getSource().removeFeature(features[i]);
				}
			}
		}
	},
	//라인 노드별 분할	// 수정함
	lineNodeSplit: (feature, map) => {
		if (feature.getGeometry().getType().indexOf('LineString') !== -1) {
			// coordinate
			let coords = feature.getGeometry().getCoordinates();

			let splitFlag = false;

			if (feature.getGeometry().getType().indexOf('Multi') !== -1) {	// Multi 일때와 아닐때로 나누어서 실행 조건 걸기 splitFlag가 false이면 실행 안됨
				if (coords[0].length > 2 || coords.length>=2){ splitFlag = true; }
			} else {
				if (coords.length > 2){ splitFlag = true; }
			}
			// console.log(splitFlag);
			// debugger;
			if (splitFlag) {
				// 위의 for문에서 찾은 node list에 따라 line의 geometry를 변경 및 생성해주고, source와 target 값을 넣어줌
				if (feature.getGeometry().getType().indexOf('Multi') !== -1) {
					for(let i = 0; i < coords.length; i++){
						console.log(coords[i]);
						for (let j = 0; j < coords[i].length-1; j++) {
							if (i === 0 && j === 0) {
								const coord = coords[i].slice(j, j + 2);
								console.log(coord);
								const geom = feature.getGeometry();
								geom.setCoordinates([coord]);
								feature.setGeometry(geom);
							} else {
								const coord = coords[i].slice(j, j + 2);
								let newFeature = null;
								newFeature = new Feature(new MultiLineString([coord]));
								map.getLayers().getArray()[1].getSource().addFeature(newFeature);
							}					
						}
					}
				} else {
					for (let i = 0; i < coords.length-1; i++) {
						if (i === 0) {
							const coord = coords.slice(i, i + 2);
							const geom = feature.getGeometry();
							geom.setCoordinates(coord);
							feature.setGeometry(geom);
						} else {
							const coord = coords.slice(i, i + 2);
							let newFeature = null;
							newFeature = new Feature(new LineString(coord));
	
							// 새로 추가된 피쳐에 속성 정보 넣어주기
							/*let obj = {};
							newFeature.setProperties(obj);*/
							map.getLayers().getArray()[1].getSource().addFeature(newFeature);
						}					
					}
				}
			} else {
				alert('분할피쳐 없음');
			}
		}
	},
	//라인 분할 // 수정 중
	lineSplit: (feature, map, select) => {
		if (feature.getGeometry().getType().indexOf('LineString') !== -1) {
			map.removeInteraction(select);

			const drawEvent = new Draw({
				//source: source,
				geometryName: 'geom',
				type: 'LineString'
			});

			drawEvent.on('drawend', function (e) {
				// debugger;
				const reader = new GeoJSONReader();

				const target = reader.read({ type: feature.getGeometry().getType(), coordinates: feature.getGeometry().getCoordinates() });
				const splitLine = reader.read({ type: e.feature.getGeometry().getType(), coordinates: e.feature.getGeometry().getCoordinates() });

				const unionFunc = new UnionOp();
				// debugger;
				const union = unionFunc.getClass().union(target, splitLine);
				// console.log(union);
				console.log(union._geometries);
				const array=[];
				union._geometries.forEach(line=>{
					array.push(line._points._coordinates);
					console.log(line._points._coordinates);
				})
				console.log(union._geometries[1]._points._coordinates[0]);
				console.log(union._geometries[3]._points._coordinates[0]);
				console.log(union._geometries[1]._points._coordinates[0] == union._geometries[3]._points._coordinates[0] ? "true" : "false");
				
				// console.log(union._geometries[union._geometries.length - 1]._points._coordinates[0]);
				// while(array[0][0] !== array[array.length-1][0]){
				// 	console.log(array[0]);
					
				// 	array.shift();
				// }
				console.log(array[1][0]);
				console.log(array[3][0]);

				console.log(array[1][0] == array[3][0] ? "true" : "false"); // 같은지 확인할 방법 찾기 
				map.removeInteraction(this);
				map.addInteraction(select);
			})
			map.addInteraction(drawEvent);
		} 
	},
	//폴리곤 분할
	polygonSplit: (feature, map, select) => {
		if (feature.getGeometry().getType() === 'Polygon') {
			map.removeInteraction(select);

			const drawEvent = new Draw({
				//source: source,
				geometryName: 'geom',
				type: 'LineString'
			});

			drawEvent.on('drawend', function (e) {
				const reader = new GeoJSONReader();
				const writer = new GeoJSONWriter();
				const geoJson = new GeoJSON();

				const target = reader.read({ type: feature.getGeometry().getType(), coordinates: feature.getGeometry().getCoordinates() });
				const splitLine = reader.read({ type: e.feature.getGeometry().getType(), coordinates: e.feature.getGeometry().getCoordinates() });

				const unionFunc = new UnionOp();
				const union = unionFunc.getClass().union(target.getExteriorRing(), splitLine);
				const polygonizer = new Polygonizer();
				polygonizer.add(union);

				const polygons = polygonizer.getPolygons();

				if (polygons.array.length > 1) {
					for (let i = 0; i < polygons.array.length; i++) {
						if (i === 0) {
							feature.setGeometry(geoJson.readGeometry(writer.write(polygons.array[i])));
						} else {
							const newFeature = new Feature(geoJson.readGeometry(writer.write(polygons.array[i])));
							//feature.setProperties(feature.getProperties());
							map.getLayers().getArray()[1].getSource().addFeature(newFeature);
						}
					}
				} else {
					alert('분할할 피쳐가 없습니다.');
				}

				map.removeInteraction(this);
				map.addInteraction(select);
			})
			map.addInteraction(drawEvent);
		} else if (feature.getGeometry().getType() === 'MultiPolygon') {

		}
	},
	pointSplit: (feature, map) => {
		if (feature.getGeometry().getType() === 'MultiPoint') {

		}
	},
	deleteFeature: (feature, map) => {
		map.getLayers().getArray()[1].getSource().removeFeature(feature);
	}

}

export default editors;